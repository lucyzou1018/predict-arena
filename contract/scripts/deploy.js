const hre = require("hardhat");
async function main() {
  const USDC = process.env.USDC_ADDRESS || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  console.log("Deploying BtcPredictArena with USDC:", USDC);
  const Arena = await hre.ethers.getContractFactory("BtcPredictArena");
  const arena = await Arena.deploy(USDC);
  await arena.waitForDeployment();
  console.log("BtcPredictArena deployed to:", await arena.getAddress());
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
