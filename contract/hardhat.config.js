require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const baseSepoliaRpc =
  process.env.BASE_SEPOLIA_RPC_URL ||
  process.env.RPC_URL ||
  "https://sepolia.base.org";

const baseMainnetRpc =
  process.env.BASE_MAINNET_RPC_URL ||
  process.env.MAINNET_RPC_URL ||
  "https://mainnet.base.org";

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
    },
  },
  networks: {
    hardhat: {},
    baseSepolia: {
      url: baseSepoliaRpc,
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
      chainId: 84532,
    },
    baseMainnet: {
      url: baseMainnetRpc,
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
      chainId: 8453,
    },
  },
};
