# About

This repo contains smart contracts related to managing Palm network ecosystem funds.

# Local Development
## Running a local node
To run a local Ethereum node for testing, you can invoke:
```shell
npm run local-node
```

## Testing
To execute unit tests run:
```shell
npm test
```

# PalmEcosystemVestingWallet Contract
## About
This contract is designed to hold PALM ecosystem funds.  These funds will vest over time.  As funds vest, they can be released to the designated `beneficiary`.

This contract has an `owner` with the following admin rights over the contract:
* Distributions can be paused
* The vesting duration can be updated
* The target beneficiary can be updated

## Deploy
To print documentation on the deploy command run:

```shell
npm run deploy-help
```

For example, the following command will deploy to a local network:
```shell
npx hardhat deploy --network localhost --beneficiary "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" --start-date 2022-12-01 --end-date 2026-12-01 --final-owner "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
```