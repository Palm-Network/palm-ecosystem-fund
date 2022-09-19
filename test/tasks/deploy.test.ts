import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {BigNumber, Contract} from "ethers";
import {time, takeSnapshot, SnapshotRestorer} from "@nomicfoundation/hardhat-network-helpers";
import {ethers} from "hardhat";
import hre from "hardhat";
import {expect} from "chai";

const ONE_GWEI = BigNumber.from(1_000_000_000);
const ONE_PALM = ONE_GWEI.mul(ONE_GWEI);

describe("Deploy Task", function () {
	const startDate = "2100-01-01";
	const endDate = "2104-01-01";
	type DeployParams = { contract: Contract, deployer: SignerWithAddress; finalOwner: SignerWithAddress; beneficiary: SignerWithAddress; vestingStartTime: number, vestingEndTime:number };
	async function deployVestingContract(withFinalOwner:boolean): Promise<DeployParams> {
		const vestingStartTime = new Date(startDate).getTime() / 1000;
		const vestingEndTime = new Date(endDate).getTime() / 1000;

		// Check assumptions
		expect(new Date(vestingStartTime * 1000).toISOString()).to.equal(`${startDate}T00:00:00.000Z`);
		expect(new Date(vestingEndTime * 1000).toISOString()).to.equal(`${endDate}T00:00:00.000Z`);

		// Contracts are deployed using the first signer/account by default
		const [deployer, beneficiary, finalOwner] = await ethers.getSigners();

		// Deploy vesting contract
		const taskArgs:any = {beneficiary:beneficiary.address, startDate, endDate, dryRun: false, silent: true};
		if (withFinalOwner) {
			taskArgs.finalOwner = finalOwner.address;
		}
		const contractAddress = await hre.run("deploy", taskArgs);
		const contractFactory = await ethers.getContractFactory("PalmEcosystemVestingWallet");
		const contract = contractFactory.attach(contractAddress);

		return  { contract, deployer, beneficiary, finalOwner, vestingStartTime, vestingEndTime };
	}

	let initialSnapshot:SnapshotRestorer;
	before(async() => {
		initialSnapshot = await takeSnapshot();
	});

	it("Should fail if beneficiary is not formatted correctly", async () => {
		const result = hre.run("deploy", {
			beneficiary: "0x01",
			startDate,
			endDate,
			dryRun: false,
			silent: true
		});
		expect(result).to.be.rejectedWith("Invalid beneficiary address supplied: expecting a 20 byte hex string");
	});

	it("Should fail if final owner is not formatted correctly", async () => {
		const beneficiary = (await ethers.getSigners())[1];
		const result = hre.run("deploy", {
			beneficiary: beneficiary.address,
			finalOwner: "0x01",
			startDate,
			endDate,
			dryRun: false,
			silent: true
		});
		expect(result).to.be.rejectedWith("Invalid final owner address supplied: expecting a 20 byte hex string");
	});

	it("Should fail if startDate is not formatted correctly", async () => {
		const beneficiary = (await ethers.getSigners())[1];
		const currentTime = await time.latest();
		const result = hre.run("deploy", {
			beneficiary: beneficiary.address,
			startDate: (currentTime + 1),
			endDate,
			dryRun: false,
			silent: true
		});
		expect(result).to.be.rejectedWith("Invalid startDate: must be formatted YYYY-MM-DD");
	});

	it("Should fail if endDate is not formatted correctly", async () => {
		const beneficiary = (await ethers.getSigners())[1];
		const currentTime = await time.latest();
		const result = hre.run("deploy", {
			beneficiary: beneficiary.address,
			startDate,
			endDate: (currentTime + 1),
			dryRun: false,
			silent: true
		});
		expect(result).to.be.rejectedWith("Invalid endDate: must be formatted YYYY-MM-DD");
	});

	it("Should fail if startDate is after endDate", async () => {
		const beneficiary = (await ethers.getSigners())[1];
		const result = hre.run("deploy", {
			beneficiary: beneficiary.address,
			startDate: endDate,
			endDate: startDate,
			dryRun: false,
			silent: true
		});
		expect(result).to.be.rejectedWith("The supplied startDate must be before the endDate");
	});

	runPostDeployTests(false);
	runPostDeployTests(true);
	function runPostDeployTests(withFinalOwner: boolean) {
		let deployParams: DeployParams;
		let owner:SignerWithAddress;
		describe(`Deploy contracts with ${withFinalOwner ? "no final owner" : "a final owner"}`, () => {
			let deploySnapshot:SnapshotRestorer;
			beforeEach( async function () {
				await (deploySnapshot || initialSnapshot).restore();
				if (!deploySnapshot) {
					deployParams = await deployVestingContract(withFinalOwner);
					deploySnapshot = await takeSnapshot();
				}
				owner = withFinalOwner ? deployParams.finalOwner : deployParams.deployer;
			});

			describe("After deployment", function () {
				// Define some helpers to modify block timestamp
				async function setTimeAtStartOfVesting() {
					await time.increaseTo(deployParams.vestingStartTime - 1);
				}

				async function setTimeToHalfwayThroughVesting() {
					const {vestingStartTime, vestingEndTime} = deployParams;
					await time.increaseTo((vestingStartTime + vestingEndTime) / 2 - 1);
				}

				async function setTimeToEndOfVestingPeriod() {
					const {vestingEndTime} = deployParams;
					await time.increaseTo(vestingEndTime - 1);
				}

				it("Should have the expected owner", async () => {
					const {contract} = deployParams;

					expect(await contract.owner()).to.equal(owner.address);
				});

				describe("After funding", async () => {
					type FundParams = { fundAmount: BigNumber };
					let fundingParams: FundParams & DeployParams;
					beforeEach(async function () {
						const {deployer, contract} = deployParams;

						// Fund the contract with native tokens
						const fundAmount: BigNumber = ONE_PALM.mul(1000);
						await deployer.sendTransaction({to: contract.address, value: fundAmount});

						fundingParams = {...deployParams, fundAmount};
					});

					describe("At the start of the vesting period", function () {
						beforeEach(setTimeAtStartOfVesting);

						it("Should not release any funds to beneficiary", async () => {
							const {contract, beneficiary, fundAmount} = fundingParams;
							const beneficiaryInitialBalance = await beneficiary.getBalance();

							await contract["release()"]();

							const contractBalance = await contract.provider.getBalance(contract.address);
							const beneficiaryBalance = await beneficiary.getBalance();
							expect(contractBalance).to.equal(fundAmount.toString());
							expect(beneficiaryBalance).to.equal(beneficiaryInitialBalance);
						});
					});

					describe("Halfway through the vesting period", function () {
						beforeEach(setTimeToHalfwayThroughVesting);

						it("Should release half of funds to beneficiary", async () => {
							const {contract, beneficiary, fundAmount} = fundingParams;
							const beneficiaryInitialBalance = await beneficiary.getBalance();
							const halfOfFunds = fundAmount.div(2);

							await contract["release()"]();

							const contractBalance = await contract.provider.getBalance(contract.address);
							const beneficiaryBalance = await beneficiary.getBalance();
							expect(contractBalance).to.equal(halfOfFunds);
							expect(beneficiaryBalance).to.equal(halfOfFunds.add(beneficiaryInitialBalance));
						});
					});

					describe("At the end of the vesting period", function () {
						beforeEach(setTimeToEndOfVestingPeriod);

						it("Should release all of the funds to beneficiary", async () => {
							const {contract, beneficiary, fundAmount} = fundingParams;
							const beneficiaryInitialBalance = await beneficiary.getBalance();

							await contract["release()"]();

							const contractBalance = await contract.provider.getBalance(contract.address);
							const beneficiaryBalance = await beneficiary.getBalance();
							expect(contractBalance).to.equal(0);
							expect(beneficiaryBalance).to.equal(fundAmount.add(beneficiaryInitialBalance));
						});
					});
				});
			});
		});
	}
});