import{createContext,useContext,useState,useCallback,useEffect,useRef}from"react";
import{ethers}from"ethers";
import{CHAIN}from"../config/constants";

const Ctx=createContext(null);
function mockAddr(){const h="0123456789abcdef";let a="0x";for(let i=0;i<40;i++)a+=h[Math.floor(Math.random()*16)];return a;}

/**
 * Known wallet RDNS identifiers (EIP-6963) and fallback install URLs.
 * Order here = display order in the modal.
 */
const KNOWN_WALLETS=[
  {rdns:"io.metamask",id:"metamask",name:"MetaMask",installUrl:"https://metamask.io/download/"},
  {rdns:"com.coinbase.wallet",id:"coinbase",name:"Coinbase Wallet",installUrl:"https://www.coinbase.com/wallet/downloads"},
  {rdns:"com.okex.wallet",id:"okx",name:"OKX Wallet",installUrl:"https://www.okx.com/web3"},
  {rdns:"app.phantom",id:"phantom",name:"Phantom",installUrl:"https://phantom.app/download"},
  {rdns:"io.rabby",id:"rabby",name:"Rabby Wallet",installUrl:"https://rabby.io/"},
];

export function WalletProvider({children}){
  const[wallet,setWallet]=useState(null);
  const[provider,setProvider]=useState(null);
  const[signer,setSigner]=useState(null);
  const[chainOk,setChainOk]=useState(true);
  const[connecting,setConnecting]=useState(false);
  const[mockMode,setMockMode]=useState(false);
  const[balance,setBalance]=useState("100.00");
  const[walletName,setWalletName]=useState("");
  const[showWalletModal,setShowWalletModal]=useState(false);
  const[showWalletMenu,setShowWalletMenu]=useState(false);
  const[connectStep,setConnectStep]=useState("");
  const[connectError,setConnectError]=useState("");
  const[pendingAction,setPendingAction]=useState(null);
  const STORAGE_KEY = "btc-predict-arena-wallet";
  const DISCONNECT_KEY = "btc-predict-arena-disconnected";

  /* ---- EIP-6963: collect announced wallet providers ---- */
  const eip6963Map=useRef(new Map()); // rdns -> {info, provider}

  useEffect(()=>{
    const handler=(e)=>{
      const{info,provider:p}=e.detail;
      if(info?.rdns) eip6963Map.current.set(info.rdns,{info,provider:p});
    };
    window.addEventListener("eip6963:announceProvider",handler);
    // Request all providers to announce themselves
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    return()=>window.removeEventListener("eip6963:announceProvider",handler);
  },[]);


  useEffect(()=>{
    try{
      const saved=localStorage.getItem(STORAGE_KEY);
      if(!saved)return;
      const data=JSON.parse(saved);
      if(data?.mode==="mock"){
        setWallet(data.wallet||mockAddr());
        setMockMode(true);
        setChainOk(true);
        setWalletName(data.walletName||"Demo");
        return;
      }
    }catch{}
  },[]);

  /* ---- Build wallet list for the modal ---- */
  const getWalletProviders=useCallback(()=>{
    // Re-request in case new wallets loaded
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    const list=KNOWN_WALLETS.map(kw=>{
      const found=eip6963Map.current.get(kw.rdns);
      if(found){
        return{
          id:kw.id,
          name:found.info.name||kw.name,
          icon:found.info.icon||null, // data URI from wallet extension
          provider:found.provider,
          installed:true,
          installUrl:kw.installUrl,
        };
      }
      return{
        id:kw.id,
        name:kw.name,
        icon:null,
        provider:null,
        installed:false,
        installUrl:kw.installUrl,
      };
    });

    // Append any EIP-6963 wallets we didn't pre-list (unknown wallets)
    for(const[rdns,{info,provider:p}]of eip6963Map.current){
      if(!KNOWN_WALLETS.some(kw=>kw.rdns===rdns)){
        list.push({
          id:rdns,
          name:info.name||"Unknown Wallet",
          icon:info.icon||null,
          provider:p,
          installed:true,
          installUrl:null,
        });
      }
    }

    // Demo mode always last
    list.push({id:"mock",name:"Demo Mode",icon:null,provider:null,installed:true,installUrl:null});
    return list;
  },[]);

  /* ---- Chain helpers ---- */
  const checkChain=useCallback(async(eth)=>{
    if(!eth)return false;
    try{
      const c=await eth.request({method:"eth_chainId"});
      const ok=c.toLowerCase()===CHAIN.chainId.toLowerCase();
      setChainOk(ok);return ok;
    }catch{return false;}
  },[]);

  const switchChain=useCallback(async(eth=activeEthRef.current)=>{
    if(!eth)return;
    try{await eth.request({method:"wallet_switchEthereumChain",params:[{chainId:CHAIN.chainId}]})}
    catch(e){if(e.code===4902)await eth.request({method:"wallet_addEthereumChain",params:[CHAIN]})}
    return await checkChain(eth);
  },[checkChain]);

  /* ---- Connect flow ---- */
  // Keep track of which raw EIP-1193 provider is actively connected
  const activeEthRef=useRef(null);

  const connectWithProvider=useCallback(async(walletInfo)=>{
    // Demo mode
    if(walletInfo.id==="mock"){
      const demoWallet=mockAddr();
      setWallet(demoWallet);setMockMode(true);setChainOk(true);
      setWalletName("Demo");setShowWalletModal(false);setConnectStep("");
      try{localStorage.removeItem(DISCONNECT_KEY);localStorage.setItem(STORAGE_KEY,JSON.stringify({mode:"mock",wallet:demoWallet,walletName:"Demo"}))}catch{}
      return;
    }
    // Not installed → open install page
    if(!walletInfo.installed){
      window.open(walletInfo.installUrl,"_blank");return;
    }

    const eth=walletInfo.provider; // EIP-1193 provider from EIP-6963
    setConnecting(true);setConnectStep("connecting");setConnectError("");

    try{
      // Step 1: Request accounts via THIS specific provider
      const accounts=await eth.request({method:"eth_requestAccounts"});
      const bp=new ethers.BrowserProvider(eth);
      const s=await bp.getSigner();

      // Step 2: Sign message to verify ownership
      setConnectStep("signing");
      const nonce=Math.floor(Math.random()*1000000);
      const message=`Welcome to AlphaMatch!\n\nPlease sign this message to verify your wallet ownership.\n\nWallet: ${accounts[0]}\nNonce: ${nonce}`;
      await s.signMessage(message);

      // Step 3: Success
      activeEthRef.current=eth;
      setWallet(accounts[0]);setProvider(bp);setSigner(s);
      setMockMode(false);setWalletName(walletInfo.name);
      try{localStorage.removeItem(DISCONNECT_KEY);localStorage.setItem(STORAGE_KEY,JSON.stringify({mode:"wallet",wallet:accounts[0],walletName:walletInfo.name}))}catch{}
      await checkChain(eth);
      setShowWalletModal(false);setConnectStep("");
    }catch(e){
      setConnectStep("error");
      setConnectError(
        e.code===4001?"User rejected the request"
        :"Connection failed, please try again"
      );
    }
    setConnecting(false);
  },[checkChain]);

  const connect=useCallback((action=null)=>{
    if(action) setPendingAction(action);
    setConnectStep("");setConnectError("");setShowWalletModal(true);
  },[]);

  const disconnect=useCallback(()=>{
    activeEthRef.current=null;
    try{localStorage.setItem(DISCONNECT_KEY,"1");localStorage.removeItem(STORAGE_KEY)}catch{}
    setWallet(null);setProvider(null);setSigner(null);
    setMockMode(false);setWalletName("");setShowWalletMenu(false);
  },[]);

  const refund=useCallback(amt=>{
    if(mockMode)setBalance(b=>(parseFloat(b)+amt).toFixed(2));
  },[mockMode]);


  useEffect(()=>{
    const reconnect=async()=>{
      if(mockMode||provider||signer) return;
      try{if(localStorage.getItem(DISCONNECT_KEY)==="1") return;}catch{}
      const providers = getWalletProviders().filter(w=>w.installed && w.provider);
      for(const detected of providers){
        try{
          const accounts = await detected.provider.request({method:"eth_accounts"});
          if(accounts?.[0]){
            activeEthRef.current=detected.provider;
            const bp=new ethers.BrowserProvider(detected.provider);
            const s=await bp.getSigner();
            setProvider(bp);
            setSigner(s);
            setWallet(accounts[0]);
            setWalletName(detected.name);
            setMockMode(false);
            try{localStorage.setItem(STORAGE_KEY,JSON.stringify({mode:"wallet",wallet:accounts[0],walletName:detected.name}))}catch{}
            await checkChain(detected.provider);
            break;
          }
        }catch{}
      }
    };
    reconnect();
  },[mockMode,provider,signer,getWalletProviders,checkChain]);

  /* ---- Listen for account / chain changes on active provider ---- */
  useEffect(()=>{
    const eth=activeEthRef.current;
    if(!eth)return;
    const onAccounts=async(accs)=>{
      if(!accs.length){disconnect();return;}
      try{
        const bp=new ethers.BrowserProvider(eth);
        const nextWallet=accs[0];
        const nextSigner=await bp.getSigner(nextWallet);
        setProvider(bp);
        setSigner(nextSigner);
        setWallet(nextWallet);
        try{
          const saved=localStorage.getItem(STORAGE_KEY);
          const parsed=saved?JSON.parse(saved):{};
          localStorage.setItem(STORAGE_KEY,JSON.stringify({
            mode:"wallet",
            wallet:nextWallet,
            walletName:parsed?.walletName||walletName,
          }));
        }catch{}
      }catch{
        setWallet(accs[0]);
      }
    };
    const onChain=()=>checkChain(eth);
    eth.on("accountsChanged",onAccounts);
    eth.on("chainChanged",onChain);
    return()=>{
      eth.removeListener("accountsChanged",onAccounts);
      eth.removeListener("chainChanged",onChain);
    };
  },[wallet,disconnect,checkChain]);

  return(
    <Ctx.Provider value={{
      wallet,provider,signer,chainOk,connecting,
      connect,disconnect,switchChain,
      mockMode,balance,setBalance,refund,
      walletName,showWalletModal,setShowWalletModal,
      showWalletMenu,setShowWalletMenu,
      connectWithProvider,getWalletProviders,
      connectStep,connectError,pendingAction,setPendingAction,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useWallet(){
  const c=useContext(Ctx);
  if(!c)throw new Error("wrap WalletProvider");
  return c;
}
