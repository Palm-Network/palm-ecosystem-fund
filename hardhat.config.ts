require('dotenv').config();
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "./tasks"

const config: HardhatUserConfig = {
  solidity: "0.8.9",
  networks: {
    "palm": {
      url: `https://palm-mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts: [process.env.PRIVATE_KEY as string],
      gasPrice: 10000
    },
    "palm-testnet": {
      url: `https://palm-testnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts: [process.env.PRIVATE_KEY as string],
      gasPrice: 10000
    }
  }
};

export default config;
