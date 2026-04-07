import{createContext,useContext,useState,useCallback}from"react";
const Ctx=createContext(null);
const INIT={gameId:null,chainGameId:null,phase:null,mode:null,teamSize:null,players:[],basePrice:null,settlementPrice:null,myPrediction:null,countdown:null,result:null,inviteCode:null};
export function GameProvider({children}){const[gs,setGs]=useState(INIT);const updateGame=useCallback(u=>setGs(p=>({...p,...u})),[]);const resetGame=useCallback(()=>setGs(INIT),[]);return<Ctx.Provider value={{gameState:gs,updateGame,resetGame}}>{children}</Ctx.Provider>;}
export function useGame(){const c=useContext(Ctx);if(!c)throw new Error("wrap GameProvider");return c;}
