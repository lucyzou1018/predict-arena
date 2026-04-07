import{useEffect,useRef,useCallback}from"react";import{io}from"socket.io-client";import{useWallet}from"../context/WalletContext";
let inst=null;
function getSocket(){if(!inst)inst=io("http://localhost:3001",{autoConnect:false,transports:["polling","websocket"]});return inst;}
export function useSocket(){
  const{wallet}=useWallet();const socket=useRef(getSocket());
  const walletRef=useRef(wallet);walletRef.current=wallet;
  useEffect(()=>{const s=socket.current;const onConnect=()=>{if(walletRef.current)s.emit("auth",{wallet:walletRef.current});};s.on("connect",onConnect);s.on("connect_error",e=>console.log("[Socket]",e.message));if(!s.connected)s.connect();return()=>{s.off("connect",onConnect);};},[]);
  useEffect(()=>{if(wallet&&socket.current.connected)socket.current.emit("auth",{wallet});},[wallet]);
  const emit=useCallback((e,d)=>socket.current.emit(e,d),[]);
  const on=useCallback((e,h)=>{socket.current.on(e,h);return()=>socket.current.off(e,h);},[]);
  return{socket:socket.current,emit,on};
}
