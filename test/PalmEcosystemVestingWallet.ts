import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";
import {BigNumber} from "ethers";

const ONE_YEAR_IN_SECS = 365 * 24 * 60 * 60;
const ONE_DAY_IN_SECONDS = 24 * 60 * 60;
const ONE_GWEI = BigNumber.from(1_000_000_000);
const ONE_PALM = ONE_GWEI.mul(ONE_GWEI);
const ZERO_ADDRESS = "0x" + "00".repeat(20);

const NOT_OWNER_ERROR = "Ownable: caller is not the owner";
const PAUSED_EXCEPTION = "Pausable: paused";

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

  describe("Admin functions", function() {
    describe("transferOwnership()", async function() {
      it("Should transfer ownership if current owner requests it", async function() {
        const { contract, owner, otherAddress } = await loadFixture(deployVestingContract);

        await contract.connect(owner).transferOwnership(otherAddress.address);
        expect(await contract.owner()).to.equal(otherAddress.address);
      });

      it("Should revert if invoked by non-owner", async function(){
        const { contract, deployer, otherAddress } = await loadFixture(deployVestingContract);

        const txResult = contract.connect(deployer).transferOwnership(otherAddress.address);
        expect(txResult).to.be.revertedWith(NOT_OWNER_ERROR);
      });
    });

    describe("pause()",  function() {
      it("Should pause the contract when the owner requests it", async function() {
        const { contract, owner } = await loadFixture(deployVestingContract);

        const initialState = await contract.paused();
        expect(initialState).to.equal(false);

        await contract.connect(owner).pause();

        const postState = await contract.paused();
        expect(postState).to.equal(true);
      });

      it("Should revert if the contract is already paused", async function() {
        const { contract, owner } = await loadFixture(deployVestingContract);
        await contract.connect(owner).pause();

        expect(contract.connect(owner).pause()).to.be.revertedWith(PAUSED_EXCEPTION);
      });

      it("Should revert if invoked by non-owner", async function() {
        const { contract, otherAddress } = await loadFixture(deployVestingContract);

        expect(contract.connect(otherAddress).pause()).to.be.revertedWith(NOT_OWNER_ERROR);
      });
    });

    describe("unpause()",  function() {
      it("Should unpause the contract when the owner requests it", async function() {
        const { contract, owner } = await loadFixture(deployVestingContract);

        await contract.connect(owner).pause();
        const initialState = await contract.paused();
        expect(initialState).to.equal(true);

        await contract.connect(owner).unpause();

        const postState = await contract.paused();
        expect(postState).to.equal(false);
      });

      it("Should revert if the contract is already unpaused", async function() {
        const { contract, owner } = await loadFixture(deployVestingContract);

        expect(contract.connect(owner).unpause()).to.be.revertedWith("Pausable: not paused");
      });

      it("Should revert if invoked by non-owner", async function() {
        const { contract, owner, otherAddress } = await loadFixture(deployVestingContract);

        await contract.connect(owner).pause();
        expect(contract.connect(otherAddress).unpause()).to.be.revertedWith(NOT_OWNER_ERROR);
      });
    });

    describe("setBeneficiary()", function() {
      it("Should set beneficiary when the owner requests it", async function() {
        const { contract, owner, beneficiary, otherAddress } = await loadFixture(deployVestingContract);

        const initialBeneficiary = await contract.beneficiary();
        expect(initialBeneficiary).to.equal(beneficiary.address);

        await contract.connect(owner).setBeneficiary(otherAddress.address);
        expect(await contract.beneficiary()).to.equal(otherAddress.address);
      });

      it("Should set beneficiary even if contract is paused", async function() {
        const { contract, owner, beneficiary, otherAddress } = await loadFixture(deployVestingContract);
        await contract.connect(owner).pause();

        // Check preconditions
        const initialBeneficiary = await contract.beneficiary();
        expect(initialBeneficiary).to.equal(beneficiary.address);

        await contract.connect(owner).setBeneficiary(otherAddress.address);
        expect(await contract.beneficiary()).to.equal(otherAddress.address);
      });

      it("Should revert if beneficiary is set to existing value", async function() {
        const { contract, owner, beneficiary } = await loadFixture(deployVestingContract);

        expect(contract.connect(owner).setBeneficiary(beneficiary.address)).to.be.revertedWith("New beneficiary must differ from current beneficiary");
      });

      it("Should revert if beneficiary is set to the zero address", async function() {
        const { contract, owner, beneficiary } = await loadFixture(deployVestingContract);

        expect(contract.connect(owner).setBeneficiary(ZERO_ADDRESS)).to.be.revertedWith("Beneficiary is zero address");
      });

      it("Should revert if invoked by non-owner", async function() {
        const { contract, deployer, otherAddress } = await loadFixture(deployVestingContract);

        expect(contract.connect(deployer).setBeneficiary(otherAddress.address)).to.be.revertedWith(NOT_OWNER_ERROR);
      });
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
