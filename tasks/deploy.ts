import {task, types} from "hardhat/config";

const dateFormat = new RegExp(/^\d{4}-(0?[1-9]|1[012])-(0?[1-9]|[12][0-9]|3[01])$/);
const addressFormat = new RegExp(/^(0x)?[0-9a-fA-F]{40}$/);
task("deploy", "Deploy a vesting contract")
  .addParam<string>("beneficiary", "The beneficiary address", undefined, types.string)
  .addParam<string>("finalOwner", "The address of the final owner / admin of the vesting contract", undefined, types.string, true)
  .addParam<string>("startDate", "The date (formatted YYYY-MM-DD) when vesting begins", undefined, types.string)
  .addParam<string>("endDate", "The date (formatted YYYY-MM-DD) when vesting ends", undefined, types.string)
  .addFlag("dryRun", "Only log a preview of the task, but do not actually execute")
  .addFlag("silent", "If set to true, suppress logging")
  .setAction( async (taskArgs, hre) => {
      const {ethers} = hre;
      const {beneficiary:beneficiaryString, finalOwner: finalOwnerString, startDate:start, endDate:end, dryRun, silent} = taskArgs;
      const deployer = (await ethers.getSigners())[0];

      // Extra validation
      if (!addressFormat.test(beneficiaryString)) {
          throw new Error("Invalid beneficiary address supplied: expecting a 20 byte hex string");
      }
      if (!!finalOwnerString && !addressFormat.test(finalOwnerString)) {
          throw new Error("Invalid final owner address supplied: expecting a 20 byte hex string");
      }
      if (!dateFormat.test(start)) {
          throw new Error("Invalid startDate: must be formatted YYYY-MM-DD");
      }
      if (!dateFormat.test(end)) {
          throw new Error("Invalid endDate: must be formatted YYYY-MM-DD");
      }
      const beneficiary = ethers.utils.getAddress(beneficiaryString).toString();
      const finalOwner = finalOwnerString ? ethers.utils.getAddress(finalOwnerString).toString() : undefined;

      // Get dates
      const startDate = new Date(Date.parse(start + " 00:00:00 UTC"));
      const endDate = new Date(Date.parse(end + " 00:00:00 UTC"));
      // More validation
      if (startDate.getTime() > endDate.getTime()) {
          throw new Error("The supplied startDate must be before the endDate");
      }

      // Warn on dry-run
      if (dryRun) {
          !silent && console.warn("This is a dry run. No contract will actually be deployed.");
      }

      // Log feedback on the supplied parameters
      !silent && console.log(`Deploying new vesting contract for beneficiary ${beneficiary}`);
      !silent && console.log(`\tVesting starts: ${startDate.toUTCString()}`);
      !silent && console.log(`\tVesting completes: ${endDate.toUTCString()}`);

      // Calculate deployment arguments and log them
      const startTime = startDate.getTime() / 1000;
      const endTime = endDate.getTime() / 1000;
      const duration = endTime - startTime;
      !silent && console.log(`Contract deployment arguments:`);
      !silent && console.log(`\tbeneficiary: ${beneficiary}`);
      !silent && console.log(`\tstartTime: ${startTime}`);
      !silent && console.log(`\tduration: ${duration}`);
      if (finalOwner) {
          !silent && console.log(`Ownership will be transferred to: ${finalOwner}`);
      } else {
          !silent && console.log(`No final owner specified, the deployer will remain the owner: ${deployer.address}`);
      }

      // Deploy
      if (!dryRun) {
          const contractFactory = await ethers.getContractFactory("PalmEcosystemVestingWallet");
          const contract = await contractFactory.deploy(beneficiary, startTime, duration);
          await contract.deployed();

          !silent && console.log("Contract deployed to:", contract.address);

          if (finalOwner) {
              !silent && console.log(`Transferring ownership to ${finalOwner}.`);
              await contract.transferOwnership(finalOwner);
          }

          return contract.address;
      }
  });