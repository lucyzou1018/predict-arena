import { CONTRACT_ADDRESS, USDC_ADDRESS } from "./constants";
export const ARENA_ABI = [ "function payForGame(uint256) external", "function predict(uint256, uint8) external", "function claimReward(uint256) external", "function getGameInfo(uint256) external view returns (uint256,uint8,uint8,uint256,uint256,uint256,bool,string)", "function getPlayerPrediction(uint256, address) external view returns (uint8,bool,uint256,bool)", "function getGamePlayers(uint256) external view returns (address[])" ];
export const ERC20_ABI = [ "function approve(address, uint256) external returns (bool)", "function allowance(address, address) external view returns (uint256)", "function balanceOf(address) external view returns (uint256)" ];
export { CONTRACT_ADDRESS, USDC_ADDRESS };
