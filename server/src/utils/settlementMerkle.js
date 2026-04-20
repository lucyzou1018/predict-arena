import { ethers } from "ethers";

const coder = ethers.AbiCoder.defaultAbiCoder();

function normalizeWallet(wallet) {
  return ethers.getAddress(wallet);
}

function normalizePredictionValue(prediction) {
  if (prediction === "up" || prediction === 1 || prediction === "1") return 1;
  if (prediction === "down" || prediction === 2 || prediction === "2") return 2;
  return 0;
}

function normalizeRewardRaw(rewardRaw) {
  if (typeof rewardRaw === "bigint") return rewardRaw;
  if (typeof rewardRaw === "number") return BigInt(Math.floor(rewardRaw));
  if (typeof rewardRaw === "string") return BigInt(rewardRaw);
  return 0n;
}

export function buildSettlementLeaf(gameId, wallet, prediction, rewardRaw) {
  return ethers.keccak256(coder.encode(
    ["uint256", "address", "uint8", "uint256"],
    [BigInt(gameId), normalizeWallet(wallet), normalizePredictionValue(prediction), normalizeRewardRaw(rewardRaw)],
  ));
}

function hashPair(left, right) {
  if (!left) return right;
  if (!right) return left;
  return left.toLowerCase() < right.toLowerCase()
    ? ethers.keccak256(ethers.solidityPacked(["bytes32", "bytes32"], [left, right]))
    : ethers.keccak256(ethers.solidityPacked(["bytes32", "bytes32"], [right, left]));
}

export function buildSettlementTree(gameId, rows = []) {
  const normalizedRows = [...rows]
    .map((row) => ({
      wallet: normalizeWallet(row.wallet),
      prediction: normalizePredictionValue(row.prediction),
      rewardRaw: normalizeRewardRaw(row.rewardRaw),
    }))
    .sort((a, b) => a.wallet.toLowerCase().localeCompare(b.wallet.toLowerCase()));

  const leaves = normalizedRows.map((row) => buildSettlementLeaf(gameId, row.wallet, row.prediction, row.rewardRaw));
  if (leaves.length === 0) {
    return { root: ethers.ZeroHash, leaves: [], rows: [], layers: [[]] };
  }

  const layers = [leaves];
  while (layers[layers.length - 1].length > 1) {
    const previousLayer = layers[layers.length - 1];
    const nextLayer = [];
    for (let i = 0; i < previousLayer.length; i += 2) {
      const left = previousLayer[i];
      const right = previousLayer[i + 1];
      nextLayer.push(right ? hashPair(left, right) : left);
    }
    layers.push(nextLayer);
  }

  return {
    root: layers[layers.length - 1][0],
    leaves,
    rows: normalizedRows,
    layers,
  };
}

export function buildSettlementProof(tree, wallet) {
  if (!tree?.rows?.length) return [];
  const normalizedWallet = normalizeWallet(wallet).toLowerCase();
  let index = tree.rows.findIndex((row) => row.wallet.toLowerCase() === normalizedWallet);
  if (index < 0) return [];

  const proof = [];
  for (let layerIndex = 0; layerIndex < tree.layers.length - 1; layerIndex += 1) {
    const layer = tree.layers[layerIndex];
    const siblingIndex = index % 2 === 0 ? index + 1 : index - 1;
    if (siblingIndex < layer.length) {
      proof.push(layer[siblingIndex]);
    }
    index = Math.floor(index / 2);
  }
  return proof;
}
