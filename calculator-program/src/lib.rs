use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
};
use std::convert::TryInto;

/// Define the type of state stored in accounts
#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct CalculatorAccount {
    /// The result of the operation
    pub result: f64,
}

// Declare and export the program's entrypoint
entrypoint!(process_instruction);

// Program entrypoint's implementation
pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    msg!("Calculator Rust program entrypoint");

    let accounts_iter = &mut accounts.iter();

    let account = next_account_info(accounts_iter)?;

    // Create the program account if it doesn't exist
    if account.owner != program_id {
        msg!("Creating calculator account");
        let data = &mut account.data.borrow_mut();
        // let mut calculator_account = CalculatorAccount { result: 0.0 };
        let calculator_account = CalculatorAccount { result: 0.0 };
        calculator_account
            .serialize(&mut &mut data[..])
            .map_err(|_| ProgramError::InvalidAccountData)?;
        msg!("Calculator account created");
    }

    // let mut calculator_account = CalculatorAccount::try_from_slice(&account.data.borrow())?;

    let mut calculator_account = {
        let data = account.data.borrow();
        CalculatorAccount::try_from_slice(&data[..])?
    };

    // Decode the instruction data to determine the operation
    if instruction_data.len() < 1 {
        msg!("Invalid instruction data");
        return Err(ProgramError::InvalidInstructionData);
    }

    let operation = instruction_data[0];

    // Handle the operation based on user input
    match operation {
        0 => {
            // Addition operation
            msg!("Performing addition");
            if instruction_data.len() < 17 {
                msg!("Invalid instruction data");
                return Err(ProgramError::InvalidInstructionData);
            }
            let num1_bytes = &instruction_data[1..9];
            let num2_bytes = &instruction_data[9..17];
            let num1 = f64::from_le_bytes(num1_bytes.try_into().unwrap());
            let num2 = f64::from_le_bytes(num2_bytes.try_into().unwrap());
            calculate_sum(&mut calculator_account, num1, num2);
        }
        1 => {
            // Subtraction operation
            msg!("Performing subtraction");
            if instruction_data.len() < 17 {
                msg!("Invalid instruction data");
                return Err(ProgramError::InvalidInstructionData);
            }
            let num1_bytes = &instruction_data[1..9];
            let num2_bytes = &instruction_data[9..17];
            let num1 = f64::from_le_bytes(num1_bytes.try_into().unwrap());
            let num2 = f64::from_le_bytes(num2_bytes.try_into().unwrap());
            calculate_difference(&mut calculator_account, num1, num2);
        }
        _ => {
            msg!("Invalid operation");
            return Err(ProgramError::InvalidInstructionData);
        }
    }

    calculator_account.serialize(&mut &mut account.data.borrow_mut()[..])?;

    Ok(())
}

// Sum function
pub fn calculate_sum(account: &mut CalculatorAccount, num1: f64, num2: f64) {
    account.result = num1 + num2;
}

// Difference function
pub fn calculate_difference(account: &mut CalculatorAccount, num1: f64, num2: f64) {
    account.result = num1 - num2;
}

#[cfg(test)]
mod tests {
    use super::*;
    use solana_program::clock::Epoch;
    use std::mem;

    #[test]
    fn test_calculator_contract() {
        let program_id = Pubkey::default();
        let key = Pubkey::default();
        let mut lamports = 0;
        let mut data = vec![0; mem::size_of::<CalculatorAccount>()];
        let owner = Pubkey::default();
        let account = AccountInfo::new(
            &key,
            false,
            true,
            &mut lamports,
            &mut data,
            &owner,
            false,
            Epoch::default(),
        );
        let mut instruction_data = vec![0; 17];

        // Test addition operation
        instruction_data[0] = 0;
        let num1: f64 = 3.5; // Specify f64 type
        let num2: f64 = 2.0; // Specify f64 type
        instruction_data[1..9].copy_from_slice(&num1.to_le_bytes());
        instruction_data[9..17].copy_from_slice(&num2.to_le_bytes());

        let accounts = vec![account.clone()];

        process_instruction(&program_id, &accounts, &instruction_data).unwrap();
        let result_account = CalculatorAccount::try_from_slice(&accounts[0].data.borrow()).unwrap();
        assert_eq!(result_account.result, 5.5);

        // Test subtraction operation
        instruction_data[0] = 1;
        let num1: f64 = 5.7; // Specify f64 type
        let num2: f64 = 2.5; // Specify f64 type
        instruction_data[1..9].copy_from_slice(&num1.to_le_bytes());
        instruction_data[9..17].copy_from_slice(&num2.to_le_bytes());

        process_instruction(&program_id, &accounts, &instruction_data).unwrap();
        let result_account = CalculatorAccount::try_from_slice(&accounts[0].data.borrow()).unwrap();
        assert_eq!(result_account.result, 3.2);
    }
}
