import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";
import dotenv from "dotenv";
import path from "node:path";
import type { HardhatUserConfig } from "hardhat/config";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const accounts = process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.25",
    settings: {
      evmVersion: "cancun",
      optimizer: { enabled: true, runs: 200 }
    }
  },
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "",
      accounts
    }
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || ""
  }
};

export default config;
