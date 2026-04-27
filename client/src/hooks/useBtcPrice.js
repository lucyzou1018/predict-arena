import{useState,useEffect,useRef}from"react";import{useSocket}from"./useSocket";import{SERVER_URL}from"../config/constants";
export function useBtcPrice(){
  const[price,setPrice]=useState(0);const{on,emit,socket}=useSocket();
  const gotPrice=useRef(false);

  useEffect(()=>{
    const sub=()=>{emit("price:subscribe");};
    // Subscribe immediately if already connected
    if(socket.connected)sub();
    // Re-subscribe on every connect/reconnect — registered directly on socket instance
    // to avoid React lifecycle timing issues
    socket.on("connect",sub);
    const unPrice=on("price:update",d=>{if(d.price>0){setPrice(d.price);gotPrice.current=true;}});
    // Fallback: retry subscribe after short delay in case connect event was missed
    const retryTimer=setTimeout(()=>{if(!gotPrice.current)sub();},1000);
    return()=>{socket.off("connect",sub);unPrice();clearTimeout(retryTimer);};
  },[on,emit,socket]);

  // REST fallback: keep polling so the UI can recover if the socket stream stalls
  useEffect(()=>{
    const poll=()=>{fetch(`${SERVER_URL}/api/price`).then(r=>r.json()).then(d=>{if(d.price>0){setPrice(d.price);gotPrice.current=true;}}).catch(()=>{});};
    poll();
    const iv=setInterval(poll,10000);
    return()=>clearInterval(iv);
  },[]);

  return price;
}
