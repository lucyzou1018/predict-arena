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

  const [deployer] = await hre.ethers.getSigners();
  const provider = deployer.provider;
  const pendingNonce = await provider.getTransactionCount(deployer.address, "pending");
  const feeData = await provider.getFeeData();
  const basePriority = feeData.maxPriorityFeePerGas || 1_000_000n;
  const baseMaxFee = feeData.maxFeePerGas || feeData.gasPrice || 10_000_000n;
  const minPriority = 3_000_000n;
  const minMaxFee = 33_000_000n;
  const maxPriorityFeePerGas = basePriority * 2n > minPriority ? basePriority * 2n : minPriority;
  const maxFeePerGas = baseMaxFee * 2n > minMaxFee ? baseMaxFee * 2n : minMaxFee;

  console.log(`Deploying BtcPredictArena on ${network}`);
  console.log("Using USDC:", USDC);
  console.log("Deployer:", deployer.address);
  console.log("Nonce:", pendingNonce);
  console.log("maxPriorityFeePerGas:", maxPriorityFeePerGas.toString());
  console.log("maxFeePerGas:", maxFeePerGas.toString());

  const Arena = await hre.ethers.getContractFactory("BtcPredictArena");
  const arena = await Arena.deploy(USDC, {
    nonce: pendingNonce,
    maxPriorityFeePerGas,
    maxFeePerGas,
  });
  await arena.waitForDeployment();
  const address = await arena.getAddress();
  console.log("BtcPredictArena deployed to:", address);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
