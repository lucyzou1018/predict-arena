import config from "../config/index.js";
class SettlementService {
  calculate(wallets, predictions, basePrice, settlementPrice) {
    const fee = config.game.entryFee * config.game.feeRate;
    const net = config.game.entryFee - fee;
    const n = wallets.length; const totalFee = fee * n;
    const isFlat = settlementPrice === basePrice;
    const dir = settlementPrice > basePrice ? "up" : "down";
    const results = wallets.map(w => {
      const pred = predictions[w] || null;
      let ok; if (isFlat) ok = true; else if (!pred) ok = false; else ok = pred === dir;
      return { wallet: w, prediction: pred, isCorrect: ok, reward: 0, lost: 0 };
    });
    const winners = results.filter(r => r.isCorrect), losers = results.filter(r => !r.isCorrect);
    if (losers.length === 0 || winners.length === 0) {
      for (const r of results) r.reward = net / 1_000_000;
    } else {
      const pool = losers.length * net, bonus = pool / winners.length;
      for (const r of winners) r.reward = (net + bonus) / 1_000_000;
      for (const r of losers) { r.reward = 0; r.lost = config.game.entryFee / 1_000_000; }
    }
    return { playerResults: results, platformFee: totalFee / 1_000_000 };
  }
}
export default new SettlementService();
