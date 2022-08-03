// SPDX-License-Identifier: ISC
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/finance/VestingWallet.sol";

// Import this file to use console.log
//import "hardhat/console.sol";

contract PalmEcosystemVestingWallet is Ownable, Pausable, VestingWallet {

    address private currentBeneficiary;

    constructor(address owner, address beneficiaryAddress, uint64 startTimestamp, uint64 durationSeconds) VestingWallet(beneficiaryAddress, startTimestamp, durationSeconds) {
        currentBeneficiary = beneficiaryAddress;
        _transferOwnership(owner);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function beneficiary() public view override returns (address) {
        return currentBeneficiary;
    }

    function setBeneficiary(address newBeneficiary) external onlyOwner {
        require(newBeneficiary != address(0), "Beneficiary is zero address");
        require(newBeneficiary != currentBeneficiary, "New beneficiary must differ from current beneficiary");
        currentBeneficiary = newBeneficiary;
    }
}
