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
  if(reason.includes("allowance")||reason.includes("exceeds allowance")){
    return "Token approval has not finished syncing yet. Please wait a moment and try again.";
  }
  if(reason.includes("could not decode result data")||reason.includes("bad data")){
    return "Payment configuration is out of date. Refresh the page and try again.";
  }
  if(reason.includes("network")||reason.includes("chain")){
    return "Wallet network is incorrect. Switch to Base Sepolia and try again.";
  }
  return err?.reason||err?.shortMessage||"Payment failed. Please try again.";
}

async function waitForAllowance(token,wallet,spender,required,retries=5,delayMs=500){
  for(let i=0;i<retries;i+=1){
    const allowance=await token.allowance(wallet,spender);
    if(allowance>=required)return allowance;
    if(i<retries-1)await new Promise(r=>setTimeout(r,delayMs));
  }
  return token.allowance(wallet,spender);
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
    const a=new ethers.Contract(CONTRACT_ADDRESS,ARENA_ABI,signer);
    const amt=ethers.parseUnits(ENTRY_FEE.toString(),6);
    setLoading(true);
    try{
      let resolvedUsdc=USDC_ADDRESS;
      try{
        const contractUsdc=await a.usdc();
        if(ethers.isAddress(contractUsdc))resolvedUsdc=contractUsdc;
      }catch{
        resolvedUsdc=USDC_ADDRESS;
      }
      const u=new ethers.Contract(resolvedUsdc,ERC20_ABI,signer);
      const al=await u.allowance(wallet,CONTRACT_ADDRESS);
      if(al<amt){
        await(await u.approve(CONTRACT_ADDRESS,ethers.MaxUint256)).wait();
        const refreshedAllowance=await waitForAllowance(u,wallet,CONTRACT_ADDRESS,amt);
        if(refreshedAllowance<amt)throw new Error("Token approval has not finished syncing yet. Please wait a moment and try again.");
      }
      await(await a.payForGame(gameId)).wait();
      return true;
    }catch(err){
      throw new Error(mapContractError(err));
    }finally{setLoading(false)}
  },[signer,wallet,chainOk,switchChain,shouldUseMockPayment,mockPay]);
  return{payForGame,loading,mockPay,shouldUseMockPayment};
}
