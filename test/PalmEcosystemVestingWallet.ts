import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";
import {BigNumber} from "ethers";

const ONE_YEAR_IN_SECS = 365 * 24 * 60 * 60;
const ONE_DAY_IN_SECONDS = 24 * 60 * 60;
const ONE_GWEI = BigNumber.from(1_000_000_000);
const ONE_PALM = ONE_GWEI.mul(ONE_GWEI);

describe("PalmEcosystemVestingWallet", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshopt in every test.
  async function deployVestingContract() {
    const currentTime = (await time.latest()) + ONE_YEAR_IN_SECS;
    const vestingStartTime = currentTime + ONE_DAY_IN_SECONDS * 7;
    const vestingDuration = ONE_YEAR_IN_SECS;

    // Contracts are deployed using the first signer/account by default
    const [deployer, owner, beneficiary, otherAddress] = await ethers.getSigners();

    const contractFactory = await ethers.getContractFactory("PalmEcosystemVestingWallet");
    const contract = await contractFactory.deploy(owner.address, beneficiary.address, vestingStartTime, vestingDuration);
    await contract.deployed();

    return { contract, deployer, owner, beneficiary, otherAddress, vestingStartTime, vestingDuration };
  }

  async function deployAndFundVestingContract() {
    const parameters = await loadFixture(deployVestingContract);
    const {deployer, contract} = parameters;

    // Fund the contract
    const fundAmount = ONE_PALM.mul(1000);
    await deployer.sendTransaction({to: contract.address, value: fundAmount});

    return {... parameters, fundAmount};
  }

  async function deployFundAndAdvanceVestingContractToStartTime() {
    const parameters = await loadFixture(deployAndFundVestingContract);
    await time.increaseTo(parameters.vestingStartTime);
    return parameters;
  }

  async function deployFundAndAdvanceVestingContractToHalfwayThroughVestingPeriod() {
    const parameters = await loadFixture(deployAndFundVestingContract);
    const {vestingStartTime, vestingDuration} = parameters;
    await time.increaseTo(vestingStartTime + vestingDuration/2);
    return parameters;
  }

  async function deployFundAndAdvanceVestingContractToEndOfVestingPeriod() {
    const parameters = await loadFixture(deployAndFundVestingContract);
    const {vestingStartTime, vestingDuration} = parameters;
    await time.increaseTo(vestingStartTime + vestingDuration);
    return parameters;
  }

  describe("Deployment", function () {
    it("Should set the expected owner", async function () {
      const { contract, owner } = await loadFixture(deployVestingContract);

      expect(await contract.owner()).to.equal(owner.address);
    });

    it("Should set the expected beneficiary", async function () {
      const { contract, beneficiary } = await loadFixture(deployVestingContract);

      expect(await contract.beneficiary()).to.equal(beneficiary.address);
    });

    it("Should set expected startTime", async function () {
      const { contract, vestingStartTime } = await loadFixture(deployVestingContract);

      expect(await contract.start()).to.equal(vestingStartTime);
    });

    it("Should set expected duration", async function () {
      const { contract, vestingDuration } = await loadFixture(deployVestingContract);

      expect(await contract.duration()).to.equal(vestingDuration);
    });
  });

  describe("Roles", function() {
    it("Should transfer ownership if current owner requests it", async () => {
      const { contract, owner, otherAddress } = await loadFixture(deployVestingContract);

      await contract.connect(owner).transferOwnership(otherAddress.address);
      expect(await contract.owner()).to.equal(otherAddress.address);
    });

    it("Should not transfer ownership if a non-owner requests it", async () => {
      const { contract, deployer, otherAddress } = await loadFixture(deployVestingContract);

      expect(contract.connect(deployer).transferOwnership(otherAddress.address))
        .to.be.revertedWith("Ownable: caller is not the owner");
    });
  })

  describe("Funding", function() {
    it("Should be able to receive funds", async function() {
      const { contract, fundAmount } = await loadFixture(deployAndFundVestingContract);

      const contractBalance = await contract.provider.getBalance(contract.address);
      expect(contractBalance).to.equal(fundAmount.toString());
    });

    it("Should be able to receive funds in multiple batches", async function() {
      const { contract, fundAmount, deployer } = await loadFixture(deployAndFundVestingContract);

      await deployer.sendTransaction({to: contract.address, value: 1});
      const contractBalance = await contract.provider.getBalance(contract.address);
      expect(contractBalance).to.equal(fundAmount.add(1).toString());
    });
  })

  describe("Withdrawals", function () {
    describe("Before vesting begins", function () {
      it("Should not transfer any funds to the beneficiary", async function () {
        const {
          contract,
          beneficiary,
          fundAmount
        } = await loadFixture(deployAndFundVestingContract);
        const beneficiaryInitialBalance = await beneficiary.getBalance();

        await contract["release()"]();

        const contractBalance = await contract.provider.getBalance(contract.address);
        const beneficiaryBalance = await beneficiary.getBalance();
        expect(contractBalance).to.equal(fundAmount.toString());
        expect(beneficiaryBalance).to.equal(beneficiaryInitialBalance);
      });
    });

    // TODO - debug these skipped tests
    describe.skip("At vesting start time", function () {
      it("Should not transfer any funds to the beneficiary", async function () {
        const {
          contract,
          beneficiary,
          fundAmount
        } = await loadFixture(deployFundAndAdvanceVestingContractToStartTime);
        const beneficiaryInitialBalance = await beneficiary.getBalance();

        await contract["release()"]();

        const contractBalance = await contract.provider.getBalance(contract.address);
        const beneficiaryBalance = await beneficiary.getBalance();
        expect(contractBalance).to.equal(fundAmount.toString());
        expect(beneficiaryBalance).to.equal(beneficiaryInitialBalance);
      });
    });

    describe.skip("Halfway through the vesting period", function () {
      it("Should release half of the funds to the beneficiary", async function () {
        const {
          contract,
          beneficiary,
          fundAmount
        } = await loadFixture(deployFundAndAdvanceVestingContractToHalfwayThroughVestingPeriod);
        const beneficiaryInitialBalance = await beneficiary.getBalance();
        const halfOfFunds = fundAmount.div(2);

        await contract["release()"]();

        const contractBalance = await contract.provider.getBalance(contract.address);
        const beneficiaryBalance = await beneficiary.getBalance();
        expect(contractBalance).to.equal(halfOfFunds.toString());
        expect(beneficiaryBalance).to.equal(halfOfFunds.add(beneficiaryInitialBalance));
      });
    });

    describe("At the end of the vesting period", function () {
      it("Should release half of the funds to the beneficiary", async function () {
        const {
          contract,
          beneficiary,
          fundAmount
        } = await loadFixture(deployFundAndAdvanceVestingContractToEndOfVestingPeriod);
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
