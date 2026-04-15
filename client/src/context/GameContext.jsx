import{createContext,useContext,useState,useCallback}from"react";
const Ctx=createContext(null);
const STORAGE_KEY="predict-arena:game-state";
const INIT={gameId:null,chainGameId:null,phase:null,mode:null,teamSize:null,players:[],basePrice:null,currentPrice:null,settlementPrice:null,myPrediction:null,predictedCount:null,countdown:null,predictSafeBuffer:null,predictionDeadline:null,result:null,failureMessage:null,inviteCode:null};
function isEmptyGameState(state){return!state?.gameId&&!state?.chainGameId&&!state?.phase&&!state?.result&&!state?.failureMessage;}
function readStoredGame(){if(typeof window==="undefined")return INIT;try{const raw=window.sessionStorage.getItem(STORAGE_KEY);if(!raw)return INIT;const parsed=JSON.parse(raw);return{...INIT,...parsed};}catch{return INIT;}}
function writeStoredGame(state){if(typeof window==="undefined")return;try{if(isEmptyGameState(state))window.sessionStorage.removeItem(STORAGE_KEY);else window.sessionStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch{}}
export function GameProvider({children}){const[gs,setGs]=useState(readStoredGame);const updateGame=useCallback(u=>setGs(p=>{const next={...p,...u};writeStoredGame(next);return next;}),[]);const resetGame=useCallback(()=>{writeStoredGame(INIT);setGs(INIT);},[]);return<Ctx.Provider value={{gameState:gs,updateGame,resetGame}}>{children}</Ctx.Provider>;}
export function useGame(){const c=useContext(Ctx);if(!c)throw new Error("wrap GameProvider");return c;}
