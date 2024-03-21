import * as anchor from '@project-serum/anchor';
import { 
  TOKEN_PROGRAM_ID, 
  ASSOCIATED_TOKEN_PROGRAM_ID, 
  getAssociatedTokenAddress, 
  getAccount 
} from "@solana/spl-token"
import { SystemProgram, PublicKey } from "@solana/web3.js"
import { expect, use } from "chai";
import chaiAsPromised from "chai-as-promised";
use(chaiAsPromised);

import { StakingProgram } from '../target/types/staking_program';

describe('staking-program', async () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());  
  const provider = anchor.AnchorProvider.env();
  const program = anchor.workspace.StakingProgram as anchor.Program<StakingProgram>;

  // derive PDA of the token mint and mint authority using our seeds 
  let tokenMint = PublicKey.findProgramAddressSync(
    [Buffer.from("token-mint")],
    program.programId
  );
  const mintAuthority = PublicKey.findProgramAddressSync(
    [Buffer.from("mint-authority")],
    program.programId
  );
  const stakingAuthority = PublicKey.findProgramAddressSync(
    [Buffer.from("staking-authority")], 
    program.programId
  );

  // Log the derived PDAs for reference
  console.log("Token mint pda: ", tokenMint[0].toBase58());
	console.log("Mint auth pda: ", mintAuthority[0].toBase58());
	console.log("Staking auth pda: ", stakingAuthority[0].toBase58());

  // Derive the associated token addresses
  const stakingVault = await getAssociatedTokenAddress(
    tokenMint[0], 
    stakingAuthority[0], 
    true
  );

  const userTokenAccount = await getAssociatedTokenAddress(
    tokenMint[0], 
    provider.wallet.publicKey
  );

  // Derive the user stake address
  const userStake = PublicKey.findProgramAddressSync(
    [provider.wallet.publicKey.toBuffer(), 
    Buffer.from("state_account")], 
    program.programId
  );

  // Log the derived addresses for reference
  console.log("Staking Vault: ", stakingVault.toBase58());
  console.log("User Token Account: ", userTokenAccount.toBase58());
  console.log("User Stake pda: ", userStake[0].toBase58());

  // Initialize the mint
  it("Create Mint", async () => {
    const tx = await program.methods.initializeMint(10)
    .accounts({
      tokenMint: tokenMint[0],
      mintAuthority: mintAuthority[0],
      payer: provider.wallet.publicKey,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      stakingAuthority: stakingAuthority[0],
      stakingTokenAccount: stakingVault,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID
    })
    .signers([])
    .rpc()
    console.log("Initialize mint tx:", tx);
  })

  // Airdrop tokens to the user's account
  it("Airdrop tokens", async () => {
    const tx = await program.methods.airdrop(new anchor.BN(12))
    .accounts({
      tokenMint: tokenMint[0],
      mintAuthority: mintAuthority[0],
      user: provider.wallet.publicKey,
      userTokenAccount: userTokenAccount,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID
    })
    .rpc()
    console.log("Airdrop tx:", tx);

    // Check if the user's token balance matches the airdropped amount
    let account = await getAccount(provider.connection, userTokenAccount);
    expect(account.amount).to.eql(BigInt(12));
  });

  // Stake tokens from the user's account to the staking vault
  it("Stake tokens", async () => {
    const tx = await program.methods.stake(new anchor.BN(25))
    .accounts({
      tokenMint: tokenMint[0],
      stakingAuthority: stakingAuthority[0],
      stakingTokenAccount: stakingVault,
      user: provider.wallet.publicKey,
      userTokenAccount: userTokenAccount,
      userStake: userStake[0],
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID
    })
    .rpc()
    console.log("Stake tx:", tx)

    // Check if the user's token balance decreased and the staking vault increased
    let account = await getAccount(provider.connection, userTokenAccount);
    expect(account.amount).to.eql(BigInt(12));

    // Check if the user's stake amount matches the staked tokens
    account = await getAccount(provider.connection, stakingVault);
    expect(account.amount).to.eql(BigInt(25));

    let stake = await program.account.stake.fetch(userStake[0]);
    expect(stake.amount.toNumber()).to.eql(25);
  })

  // Attempt to stake more tokens than the user has, expecting rejection
  it("Should not stake too many tokens", async () => {
    await expect(program.methods.stake(new anchor.BN(13))
      .accounts({
        tokenMint: tokenMint[0],
        stakingAuthority: stakingAuthority[0],
        stakingTokenAccount: stakingVault,
        user: provider.wallet.publicKey,
        userTokenAccount: userTokenAccount,
        userStake: userStake[0],
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID
      })
      .rpc()).to.be.rejected;

      
    // Check if the user's token balance and stake amount remain unchanged
    let account = await getAccount(provider.connection, userTokenAccount);
    expect(account.amount).to.eql(BigInt(12));

    account = await getAccount(provider.connection, stakingVault);
    expect(account.amount).to.eql(BigInt(25));

    let stake = await program.account.stake.fetch(userStake[0]);
    expect(stake.amount.toNumber()).to.eql(25);
  });

  // Stake the remaining tokens from the user's account to the staking vault
  it("Should stake remaining tokens", async () => {
    const tx = await program.methods.stake(new anchor.BN(12))
    .accounts({
      tokenMint: tokenMint[0],
      stakingAuthority: stakingAuthority[0],
      stakingTokenAccount: stakingVault,
      user: provider.wallet.publicKey,
      userTokenAccount: userTokenAccount,
      userStake: userStake[0],
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID
    })
    .rpc()
    console.log("Stake tx:", tx)

    // Check if the user's token balance becomes zero and staking vault increases
    let account = await getAccount(provider.connection, userTokenAccount);
    expect(account.amount).to.eql(BigInt(0));

    account = await getAccount(provider.connection, stakingVault);
    expect(account.amount).to.eql(BigInt(25 + 12));

    // Check if the user's stake amount is updated correctly
    let stake = await program.account.stake.fetch(userStake[0]);
    expect(stake.amount.toNumber()).to.eql(25 + 12);
  })

  // Unstake tokens from the staking vault back to the user's account
  it("Unstake tokens", async () => {
    const tx = await program.methods.unstake(new anchor.BN(25))
    .accounts({
      tokenMint: tokenMint[0],
      stakingAuthority: stakingAuthority[0],
      stakingTokenAccount: stakingVault,
      user: provider.wallet.publicKey,
      userTokenAccount: userTokenAccount,
      userStake: userStake[0],
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID
    })
    .rpc()
    console.log("Unstake tx:", tx)

    // Check if the user's token balance increases and staking vault decreases
    let account = await getAccount(provider.connection, userTokenAccount);
    expect(account.amount).to.eql(BigInt(25));

    account = await getAccount(provider.connection, stakingVault);
    expect(account.amount).to.eql(BigInt(12));

    // Check if the user's stake amount is updated correctly
    let stake = await program.account.stake.fetch(userStake[0]);
    expect(stake.amount.toNumber()).to.eql(12);
  })

  // Attempt to unstake more tokens than the user has staked, expecting rejection
  it("Should not unstake too many tokens", async () => {
    await expect(program.methods.unstake(new anchor.BN(13))
      .accounts({
        tokenMint: tokenMint[0],
        stakingAuthority: stakingAuthority[0],
        stakingTokenAccount: stakingVault,
        user: provider.wallet.publicKey,
        userTokenAccount: userTokenAccount,
        userStake: userStake[0],
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID
      })
      .rpc()).to.be.rejected;

      // Check if the user's token balance and staking vault remain unchanged
      let account = await getAccount(provider.connection, userTokenAccount);
      expect(account.amount).to.eql(BigInt(25));
  
      account = await getAccount(provider.connection, stakingVault);
      expect(account.amount).to.eql(BigInt(12));
  
      let stake = await program.account.stake.fetch(userStake[0]);
      expect(stake.amount.toNumber()).to.eql(12);
  })

  // Unstake the remaining tokens from the staking vault back to the user's account
  it("Should unstake remaining tokens", async () => {
    const tx = await program.methods.unstake(new anchor.BN(12))
    .accounts({
      tokenMint: tokenMint[0],
      stakingAuthority: stakingAuthority[0],
      stakingTokenAccount: stakingVault,
      user: provider.wallet.publicKey,
      userTokenAccount: userTokenAccount,
      userStake: userStake[0],
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID
    })
    .rpc()
    console.log("Unstake tx:", tx)

    // Check if the user's token balance increases and staking vault becomes zero
    let account = await getAccount(provider.connection, userTokenAccount);
    expect(account.amount).to.eql(BigInt(25+12));

    account = await getAccount(provider.connection, stakingVault);
    expect(account.amount).to.eql(BigInt(0));

    // Check if the user's stake amount becomes zero
    let stake = await program.account.stake.fetch(userStake[0]);
    expect(stake.amount.toNumber()).to.eql(0);
  })
});