// SPDX-License-Identifier: ISC
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/finance/VestingWallet.sol";

// Import this file to use console.log
//import "hardhat/console.sol";

contract PalmEcosystemVestingWallet is Ownable, Pausable, VestingWallet {

    address private currentBeneficiary;
    uint64 private currentDuration;

    constructor(address owner, address beneficiaryAddress, uint64 startTimestamp, uint64 durationSeconds) VestingWallet(beneficiaryAddress, startTimestamp, durationSeconds) {
        currentBeneficiary = beneficiaryAddress;
        currentDuration = durationSeconds;
        _transferOwnership(owner);
    }

    function release() public override whenNotPaused {
        super.release();
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

    function duration() public view override returns (uint256) {
        return currentDuration;
    }

    function setDuration(uint64 newDuration) external onlyOwner {
        require(newDuration != currentDuration, "New duration must differ from current duration");
        currentDuration = newDuration;
    }
}
