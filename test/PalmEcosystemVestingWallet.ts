import {loadFixture, time} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {ethers} from "hardhat";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {BigNumber, Contract} from "ethers";

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
  type DeployParams = { owner: SignerWithAddress; beneficiary: SignerWithAddress; contract: Contract; otherAddress: SignerWithAddress; vestingDuration: number; deployer: SignerWithAddress; erc20Contract: Contract; vestingStartTime: number };
  async function deployVestingContractFixture(): Promise<DeployParams> {
    const currentTime = (await time.latest()) + ONE_YEAR_IN_SECS;
    const vestingStartTime = currentTime + ONE_DAY_IN_SECONDS * 7;
    const vestingDuration = ONE_YEAR_IN_SECS;

    // Contracts are deployed using the first signer/account by default
    const [deployer, owner, beneficiary, otherAddress] = await ethers.getSigners();

    // Deploy vesting contract
    const contractFactory = await ethers.getContractFactory("PalmEcosystemVestingWallet");
    const contract = await contractFactory.deploy(beneficiary.address, vestingStartTime, vestingDuration);
    await contract.deployed();

    // Set owner
    await contract.transferOwnership(owner.address);

    // Deploy ERC-20
    const erc20Factory = await ethers.getContractFactory("SomeToken");
    const erc20Contract = await erc20Factory.deploy();
    await erc20Contract.deployed();

    return  { contract, erc20Contract, deployer, owner, beneficiary, otherAddress, vestingStartTime, vestingDuration };
  }

  let deployParams:DeployParams;
  beforeEach("Deploy contracts", async function() {
    deployParams  = await loadFixture(deployVestingContractFixture);
  });

  describe("After Deployment", function() {
    // Define some helpers to modify block timestamp
    async function setTimeAtStartOfVesting() {
      await time.increaseTo(deployParams.vestingStartTime - 1);
    }
    async function setTimeToHalfwayThroughVesting() {
      const {vestingStartTime, vestingDuration} = deployParams;
      await time.increaseTo(vestingStartTime + vestingDuration / 2 - 1);
    }
    async function setTimeToEndOfVestingPeriod() {
      const {vestingStartTime, vestingDuration} = deployParams;
      await time.increaseTo(vestingStartTime + vestingDuration - 1);
    }

    it("Should be configured with the expected owner", async function () {
      const { contract, owner } = deployParams;

      expect(await contract.owner()).to.equal(owner.address);
    });

    it("Should be configured with the expected beneficiary", async function () {
      const { contract, beneficiary } = deployParams;

      expect(await contract.beneficiary()).to.equal(beneficiary.address);
    });

    it("Should be configured with the expected startTime", async function () {
      const { contract, vestingStartTime } = deployParams;

      expect(await contract.start()).to.equal(vestingStartTime);
    });

    it("Should be configured with the expected duration", async function () {
      const { contract, vestingDuration } = deployParams;

      expect(await contract.duration()).to.equal(vestingDuration);
    });

    describe("Admin functions", function() {
      describe("transferOwnership()", async function() {
        it("Should transfer ownership if current owner requests it", async function() {
          const { contract, owner, otherAddress } = deployParams;

          await contract.connect(owner).transferOwnership(otherAddress.address);
          expect(await contract.owner()).to.equal(otherAddress.address);
        });

        it("Should revert if invoked by non-owner", async function(){
          const { contract, deployer, otherAddress } = deployParams;

          const txResult = contract.connect(deployer).transferOwnership(otherAddress.address);
          await expect(txResult).to.be.revertedWith(NOT_OWNER_ERROR);
        });
      });

      describe("pause()",  function() {
        it("Should pause the contract when the owner requests it", async function() {
          const { contract, owner } = deployParams;

          const initialState = await contract.paused();
          expect(initialState).to.equal(false);

          await contract.connect(owner).pause();

          const postState = await contract.paused();
          expect(postState).to.equal(true);
        });

        it("Should revert if the contract is already paused", async function() {
          const { contract, owner } = await deployParams;
          await contract.connect(owner).pause();

          await expect(contract.connect(owner).pause()).to.be.revertedWith(PAUSED_EXCEPTION);
        });

        it("Should revert if invoked by non-owner", async function() {
          const { contract, otherAddress } = await deployParams;

          await expect(contract.connect(otherAddress).pause()).to.be.revertedWith(NOT_OWNER_ERROR);
        });
      });

      describe("unpause()",  function() {
        it("Should unpause the contract when the owner requests it", async function() {
          const { contract, owner } = await deployParams;

          await contract.connect(owner).pause();
          const initialState = await contract.paused();
          expect(initialState).to.equal(true);

          await contract.connect(owner).unpause();

          const postState = await contract.paused();
          expect(postState).to.equal(false);
        });

        it("Should revert if the contract is already unpaused", async function() {
          const { contract, owner } = deployParams;

          await expect(contract.connect(owner).unpause()).to.be.revertedWith("Pausable: not paused");
        });

        it("Should revert if invoked by non-owner", async function() {
          const { contract, owner, otherAddress } = deployParams;

          await contract.connect(owner).pause();
          await expect(contract.connect(otherAddress).unpause()).to.be.revertedWith(NOT_OWNER_ERROR);
        });
      });

      describe("setBeneficiary()", function() {
        it("Should set beneficiary when the owner requests it", async function() {
          const { contract, owner, beneficiary, otherAddress } = deployParams;

          const initialBeneficiary = await contract.beneficiary();
          expect(initialBeneficiary).to.equal(beneficiary.address);

          const txResult = contract.connect(owner).setBeneficiary(otherAddress.address);
          await expect(txResult).to.emit(contract, "BeneficiaryUpdated")
            .withArgs(beneficiary.address, otherAddress.address);
          expect(await contract.beneficiary()).to.equal(otherAddress.address);
        });

        it("Should set beneficiary even if contract is paused", async function() {
          const { contract, owner, beneficiary, otherAddress } = deployParams;
          await contract.connect(owner).pause();

          // Check preconditions
          const initialBeneficiary = await contract.beneficiary();
          expect(initialBeneficiary).to.equal(beneficiary.address);

          const txResult = contract.connect(owner).setBeneficiary(otherAddress.address);
          await expect(txResult).to.emit(contract, "BeneficiaryUpdated")
            .withArgs(beneficiary.address, otherAddress.address);
          expect(await contract.beneficiary()).to.equal(otherAddress.address);
        });

        it("Should revert if beneficiary is set to existing value", async function() {
          const { contract, owner, beneficiary } = deployParams;

          await expect(contract.connect(owner).setBeneficiary(beneficiary.address)).to.be.revertedWith("New beneficiary must differ from current beneficiary");
        });

        it("Should revert if beneficiary is set to the zero address", async function() {
          const { contract, owner } = deployParams;

          await expect(contract.connect(owner).setBeneficiary(ZERO_ADDRESS)).to.be.revertedWith("Beneficiary is zero address");
        });

        it("Should revert if invoked by non-owner", async function() {
          const { contract, deployer, otherAddress } = deployParams;

          await expect(contract.connect(deployer).setBeneficiary(otherAddress.address)).to.be.revertedWith(NOT_OWNER_ERROR);
        });
      });

      describe("setDuration()", function() {

        it("Should set duration when the owner requests it", async function() {
          const { contract, owner, vestingDuration } = deployParams;

          const initialDuration = await contract.duration();
          expect(initialDuration).to.equal(vestingDuration);

          const newDuration = vestingDuration * 2;
          const txResult = contract.connect(owner).setDuration(newDuration);
          await expect(txResult).to.emit(contract, "DurationUpdated")
            .withArgs(vestingDuration, newDuration);
          expect(await contract.duration()).to.equal(newDuration);
        });

        it("Should set duration even if contract is paused", async function() {
          const { contract, owner, vestingDuration } = deployParams;
          await contract.connect(owner).pause();

          const newDuration = vestingDuration * 2;
          await contract.connect(owner).setDuration(newDuration);
          expect(await contract.duration()).to.equal(newDuration);
        });

        it("Should revert if new duration matches old duration", async function() {
          const { contract, owner, vestingDuration } = deployParams;

          await expect(contract.connect(owner).setDuration(vestingDuration)).to.be.revertedWith("New duration must differ from current duration");
        });

        it("Should revert if invoked by non-owner", async function() {
          const { contract, deployer, vestingDuration } = deployParams;

          await expect(contract.connect(deployer).setDuration(vestingDuration + 1)).to.be.revertedWith(NOT_OWNER_ERROR);
        });
      });
    });

    describe("After being funded", function() {
      type FundParams = {fundAmount:BigNumber};
      let fundingParams:FundParams&DeployParams;
      beforeEach(async function() {
        const {deployer, contract, erc20Contract} = deployParams;

        // Fund the contract with native tokens
        const fundAmount: BigNumber = ONE_PALM.mul(1000);
        await deployer.sendTransaction({to: contract.address, value: fundAmount});

        // Fund the contract with ERC-20 tokens
        await erc20Contract.mint(contract.address, fundAmount);

        fundingParams = {... deployParams, fundAmount};
      });

      it("Should have the expected native token balance", async function() {
        const { contract, fundAmount } = fundingParams;

        const contractBalance = await contract.provider.getBalance(contract.address);
        expect(contractBalance).to.equal(fundAmount.toString());
      });

      it("Should have the expected ERC-20 token balance", async function() {
        const { contract, erc20Contract, fundAmount } = fundingParams;

        const contractBalance = await erc20Contract.balanceOf(contract.address);
        expect(contractBalance).to.equal(fundAmount.toString());
      });

      it("Should be able to receive additional funds", async function() {
        const { contract, fundAmount, deployer } = fundingParams;

        await deployer.sendTransaction({to: contract.address, value: 1});
        const contractBalance = await contract.provider.getBalance(contract.address);
        expect(contractBalance).to.equal(fundAmount.add(1).toString());
      });

      describe("Withdrawals", function () {
        describe("Of native tokens", function() {
          describe("Before vesting begins", function () {
            it("Should not release any native currency to the beneficiary", async function () {
              const {
                contract,
                beneficiary,
                fundAmount
              } = fundingParams;
              const beneficiaryInitialBalance = await beneficiary.getBalance();

              await contract["release()"]();

              const contractBalance = await contract.provider.getBalance(contract.address);
              const beneficiaryBalance = await beneficiary.getBalance();
              expect(contractBalance).to.equal(fundAmount.toString());
              expect(beneficiaryBalance).to.equal(beneficiaryInitialBalance);
            });
          });

          describe("At vesting start time", function () {
            beforeEach(setTimeAtStartOfVesting);

            it("Should not release any native currency to the beneficiary", async function () {
              const {
                contract,
                beneficiary,
                fundAmount
              } = fundingParams;
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

            it("Should release half of the native currency to the beneficiary", async function () {
              const {
                contract,
                beneficiary,
                fundAmount
              } = fundingParams;
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
            beforeEach(setTimeToEndOfVestingPeriod);

            it("Should release all of the native currency to the beneficiary", async function () {
              const {
                contract,
                beneficiary,
                fundAmount
              } = fundingParams;
              const beneficiaryInitialBalance = await beneficiary.getBalance();

              await contract["release()"]();

              const contractBalance = await contract.provider.getBalance(contract.address);
              const beneficiaryBalance = await beneficiary.getBalance();
              expect(contractBalance).to.equal(0);
              expect(beneficiaryBalance).to.equal(fundAmount.add(beneficiaryInitialBalance));
            });

            it("Should revert if contract is paused", async function () {
              const {
                contract,
                owner
              } = deployParams;
              await contract.connect(owner).pause();

              await expect(contract["release()"]()).to.be.revertedWith(PAUSED_EXCEPTION);
            });
          });
        });

        describe("Of ERC-20 tokens", function() {
          describe("Before vesting begins", function () {
            it("Should not transfer any tokens to the beneficiary", async function () {
              const {
                contract,
                erc20Contract,
                beneficiary,
                fundAmount
              } = fundingParams;
              await contract["release(address)"](erc20Contract.address);

              const contractBalance = await erc20Contract.balanceOf(contract.address);
              const beneficiaryBalance = await erc20Contract.balanceOf(beneficiary.address);
              expect(contractBalance).to.equal(fundAmount.toString());
              expect(beneficiaryBalance).to.equal(0);
            });
          });

          describe("At vesting start time", function () {
            beforeEach(setTimeAtStartOfVesting);

            it("Should not transfer any tokens to the beneficiary", async function () {
              const {
                contract,
                erc20Contract,
                beneficiary,
                fundAmount
              } = fundingParams;
              await contract["release(address)"](erc20Contract.address);

              const contractBalance = await erc20Contract.balanceOf(contract.address);
              const beneficiaryBalance = await erc20Contract.balanceOf(beneficiary.address);
              expect(contractBalance).to.equal(fundAmount.toString());
              expect(beneficiaryBalance).to.equal(0);
            });
          });

          describe("Halfway through the vesting period", function () {
            beforeEach(setTimeToHalfwayThroughVesting);

            it("Should release half of the tokens to the beneficiary", async function () {
              const {
                contract,
                erc20Contract,
                beneficiary,
                fundAmount
              } = fundingParams;
              const halfOfFunds = fundAmount.div(2);

              await contract["release(address)"](erc20Contract.address);

              const contractBalance = await erc20Contract.balanceOf(contract.address);
              const beneficiaryBalance = await erc20Contract.balanceOf(beneficiary.address);
              expect(contractBalance).to.equal(halfOfFunds);
              expect(beneficiaryBalance).to.equal(halfOfFunds);
            });
          });

          describe("At the end of the vesting period", function () {
            beforeEach(setTimeToEndOfVestingPeriod);

            it("Should release all of the tokens to the beneficiary", async function () {
              const {
                contract,
                erc20Contract,
                beneficiary,
                fundAmount
              } = fundingParams;
              await contract["release(address)"](erc20Contract.address);

              const contractBalance = await erc20Contract.balanceOf(contract.address);
              const beneficiaryBalance = await erc20Contract.balanceOf(beneficiary.address);
              expect(contractBalance).to.equal(0);
              expect(beneficiaryBalance).to.equal(fundAmount);
            });

            it("Should revert if contract is paused", async function () {
              const {
                contract,
                erc20Contract,
                owner
              } = fundingParams;
              await contract.connect(owner).pause();

              await expect(contract["release(address)"](erc20Contract.address)).to.be.revertedWith(PAUSED_EXCEPTION);
            });
          });
        });
      });
    });
  });
});
