// SPDX-License-Identifier: ISC
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/finance/VestingWallet.sol";

// Import this file to use console.log
//import "hardhat/console.sol";

contract PalmEcosystemVestingWallet is Ownable, VestingWallet {

    constructor(address owner, address beneficiaryAddress, uint64 startTimestamp, uint64 durationSeconds) VestingWallet(beneficiaryAddress, startTimestamp, durationSeconds) {
        _transferOwnership(owner);
    }

}
