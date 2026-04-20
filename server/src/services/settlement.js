import config from "../config/index.js";
class SettlementService {
  calculate(wallets, predictions, basePrice, settlementPrice) {
    const feeRateBps = Math.round(config.game.feeRate * 10000);
    const entryFeeRaw = BigInt(config.game.entryFee);
    const feeRaw = (entryFeeRaw * BigInt(feeRateBps)) / 10000n;
    const netRaw = entryFeeRaw - feeRaw;
    const n = wallets.length;
    const totalFeeRaw = feeRaw * BigInt(n);
    const isFlat = settlementPrice === basePrice;
    const dir = settlementPrice > basePrice ? "up" : "down";
    const results = wallets.map(w => {
      const pred = predictions[w] || null;
      let ok; if (isFlat) ok = true; else if (!pred) ok = false; else ok = pred === dir;
      return { wallet: w, prediction: pred, isCorrect: ok, rewardRaw: 0n, reward: 0, lost: 0 };
    });
    const winners = results.filter(r => r.isCorrect), losers = results.filter(r => !r.isCorrect);
    if (losers.length === 0 || winners.length === 0) {
      for (const r of results) {
        r.rewardRaw = netRaw;
        r.reward = Number(netRaw) / 1_000_000;
      }
    } else {
      const loserPoolRaw = BigInt(losers.length) * netRaw;
      const bonusRaw = loserPoolRaw / BigInt(winners.length);
      for (const r of winners) {
        r.rewardRaw = netRaw + bonusRaw;
        r.reward = Number(r.rewardRaw) / 1_000_000;
      }
      for (const r of losers) {
        r.rewardRaw = 0n;
        r.reward = 0;
        r.lost = config.game.entryFee / 1_000_000;
      }
    }
    const totalPayoutRaw = results.reduce((sum, row) => sum + row.rewardRaw, 0n);
    return {
      playerResults: results,
      platformFeeRaw: totalFeeRaw + ((entryFeeRaw * BigInt(n)) - totalFeeRaw - totalPayoutRaw),
      platformFee: Number(totalFeeRaw + ((entryFeeRaw * BigInt(n)) - totalFeeRaw - totalPayoutRaw)) / 1_000_000,
      totalPayoutRaw,
    };
  }
}
export default new SettlementService();
