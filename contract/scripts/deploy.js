const hre = require("hardhat");

const DEFAULT_USDC = {
  baseSepolia: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  baseMainnet: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
};

async function main() {
  const network = hre.network.name;
  const fallbackUsdc = DEFAULT_USDC[network] || DEFAULT_USDC.baseSepolia;
  const USDC = process.env.USDC_ADDRESS || fallbackUsdc;
  if (!hre.ethers.isAddress(USDC)) {
    throw new Error(`Invalid USDC address: ${USDC}`);
  }
  console.log(`Deploying BtcPredictArena on ${network}`);
  console.log("Using USDC:", USDC);
  const Arena = await hre.ethers.getContractFactory("BtcPredictArena");
  const arena = await Arena.deploy(USDC);
  await arena.waitForDeployment();
  const address = await arena.getAddress();
  console.log("BtcPredictArena deployed to:", address);
  console.log("Next update:");
  console.log(`- client/.env -> VITE_CONTRACT_ADDRESS=${address}`);
  console.log(`- server/.env -> CONTRACT_ADDRESS=${address}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
