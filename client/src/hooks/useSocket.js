import{useEffect,useRef,useCallback}from"react";import{io}from"socket.io-client";import{useWallet}from"../context/WalletContext";import{SERVER_URL}from"../config/constants";
let inst=null;
function getSocket(){if(!inst)inst=io(SERVER_URL,{autoConnect:false,transports:["polling","websocket"]});return inst;}
export function useSocket(){
  const{wallet}=useWallet();const socket=useRef(getSocket());
  const walletRef=useRef(wallet);walletRef.current=wallet;
  useEffect(()=>{const s=socket.current;const onConnect=()=>{if(walletRef.current)s.emit("auth",{wallet:walletRef.current});};const onConnectError=e=>console.log("[Socket]",e.message);s.on("connect",onConnect);s.on("connect_error",onConnectError);if(!s.connected)s.connect();return()=>{s.off("connect",onConnect);s.off("connect_error",onConnectError);};},[]);
  useEffect(()=>{if(wallet&&socket.current.connected)socket.current.emit("auth",{wallet});},[wallet]);
  const emit=useCallback((e,d)=>{
    const s=socket.current;
    const send=()=>{if(e!=="auth"&&walletRef.current)s.emit("auth",{wallet:walletRef.current});s.emit(e,d);};
    if(!s.connected){s.once("connect",send);s.connect();return false;}
    send();
    return true;
  },[]);
  const on=useCallback((e,h)=>{socket.current.on(e,h);return()=>socket.current.off(e,h);},[]);
  return{socket:socket.current,emit,on};
}
