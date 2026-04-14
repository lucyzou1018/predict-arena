import{useCallback,useState}from"react";import{ethers}from"ethers";import{useWallet}from"../context/WalletContext";
import{ARENA_ABI,ERC20_ABI,CONTRACT_ADDRESS,USDC_ADDRESS}from"../config/contract";import{ENTRY_FEE}from"../config/constants";

function mapContractError(err){
  const code=err?.code||err?.info?.error?.code;
  const reason=(err?.reason||err?.shortMessage||err?.message||"").toLowerCase();
  if(code===4001||code==="ACTION_REJECTED"||reason.includes("user rejected")||reason.includes("user denied")||reason.includes("rejected")){
    return "Payment was cancelled in wallet.";
  }
  if(reason.includes("insufficient funds")){
    return "Insufficient gas balance in wallet.";
  }
  if(reason.includes("insufficient")&&reason.includes("balance")){
    return "Insufficient token balance.";
  }
  if(reason.includes("network")||reason.includes("chain")){
    return "Wallet network is incorrect. Switch to Base Sepolia and try again.";
  }
  return err?.reason||err?.shortMessage||"Payment failed. Please try again.";
}

export function useContract(){
  const{signer,wallet,mockMode,chainOk,switchChain,setBalance}=useWallet();const[loading,setLoading]=useState(false);
  const hasOnchainPayment=ethers.isAddress(CONTRACT_ADDRESS)&&ethers.isAddress(USDC_ADDRESS);
  const shouldUseMockPayment=mockMode||!hasOnchainPayment;
  const mockPay=useCallback(async()=>{setLoading(true);await new Promise(r=>setTimeout(r,400));if(mockMode)setBalance(b=>(parseFloat(b)-ENTRY_FEE).toFixed(2));setLoading(false);return true;},[mockMode,setBalance]);
  const payForGame=useCallback(async gameId=>{
    if(shouldUseMockPayment)return mockPay();
    if(!signer||!wallet)throw new Error("Wallet not connected");
    if(!chainOk){
      const switched=await switchChain();
      if(!switched)throw new Error("Switch wallet to Base Sepolia before paying");
    }
    const u=new ethers.Contract(USDC_ADDRESS,ERC20_ABI,signer);
    const a=new ethers.Contract(CONTRACT_ADDRESS,ARENA_ABI,signer);
    const amt=ethers.parseUnits(ENTRY_FEE.toString(),6);
    setLoading(true);
    try{
      const al=await u.allowance(wallet,CONTRACT_ADDRESS);
      if(al<amt)await(await u.approve(CONTRACT_ADDRESS,amt)).wait();
      await(await a.payForGame(gameId)).wait();
      return true;
    }catch(err){
      throw new Error(mapContractError(err));
    }finally{setLoading(false)}
  },[signer,wallet,chainOk,switchChain,shouldUseMockPayment,mockPay]);
  return{payForGame,loading,mockPay,shouldUseMockPayment};
}
