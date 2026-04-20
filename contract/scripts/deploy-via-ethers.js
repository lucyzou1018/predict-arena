require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Wallet, ContractFactory, parseUnits } = require("ethers");

const ARTIFACT_PATH = path.join(
  __dirname,
  "..",
  "artifacts",
  "contracts",
  "BtcPredictArena.sol",
  "BtcPredictArena.json",
);

const DEFAULT_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const DEFAULT_RPC = "https://sepolia.base.org";

async function main() {
  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL || process.env.RPC_URL || DEFAULT_RPC;
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  const usdc = process.env.USDC_ADDRESS || DEFAULT_USDC;

  if (!privateKey) {
    throw new Error("DEPLOYER_PRIVATE_KEY is missing");
  }

  const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, "utf8"));
  const provider = new JsonRpcProvider(rpcUrl, 84532, {
    staticNetwork: true,
  });
  const wallet = new Wallet(privateKey, provider);

  const balance = await provider.getBalance(wallet.address);
  console.log("Deploying with:", wallet.address);
  console.log("RPC:", rpcUrl);
  console.log("Balance:", balance.toString());
  console.log("USDC:", usdc);

  const feeData = await provider.getFeeData();
  const maxPriorityFeePerGas =
    feeData.maxPriorityFeePerGas && feeData.maxPriorityFeePerGas > 0n
      ? feeData.maxPriorityFeePerGas
      : parseUnits("0.001", "gwei");
  const maxFeePerGas =
    feeData.maxFeePerGas && feeData.maxFeePerGas > 0n
      ? feeData.maxFeePerGas
      : maxPriorityFeePerGas * 2n;

  const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const contract = await factory.deploy(usdc, {
    maxPriorityFeePerGas,
    maxFeePerGas,
  });

  console.log("Deploy tx:", contract.deploymentTransaction().hash);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("BtcPredictArena deployed to:", address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
