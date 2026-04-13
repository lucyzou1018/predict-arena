import{useCallback,useState}from"react";import{ethers}from"ethers";import{useWallet}from"../context/WalletContext";
import{ARENA_ABI,ERC20_ABI,CONTRACT_ADDRESS,USDC_ADDRESS}from"../config/contract";import{ENTRY_FEE}from"../config/constants";
export function useContract(){
  const{signer,wallet,mockMode,setBalance}=useWallet();const[loading,setLoading]=useState(false);
  const mockPay=useCallback(async()=>{setLoading(true);await new Promise(r=>setTimeout(r,400));setBalance(b=>(parseFloat(b)-ENTRY_FEE).toFixed(2));setLoading(false);return true;},[setBalance]);
  const payForGame=useCallback(async gameId=>{if(mockMode)return mockPay();if(!signer||!wallet)throw new Error("Wallet not connected");const u=new ethers.Contract(USDC_ADDRESS,ERC20_ABI,signer);const a=new ethers.Contract(CONTRACT_ADDRESS,ARENA_ABI,signer);const amt=ethers.parseUnits(ENTRY_FEE.toString(),6);setLoading(true);try{const al=await u.allowance(wallet,CONTRACT_ADDRESS);if(al<amt)await(await u.approve(CONTRACT_ADDRESS,amt)).wait();await(await a.payForGame(gameId)).wait();return true}finally{setLoading(false)}},[signer,wallet,mockMode,mockPay]);
  return{payForGame,loading,mockPay};
}
