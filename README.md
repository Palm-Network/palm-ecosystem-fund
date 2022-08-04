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
npx hardhat deploy --network localhost --beneficiary "0xD0b314E71b97Ab514AAe0CAC390594450eE952e3" --start-date 2022-12-01 --end-date 2026-12-01
```