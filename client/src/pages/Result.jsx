import{useEffect,useState}from"react";import{useNavigate,useParams}from"react-router-dom";import{SERVER_URL}from"../config/constants";
import{useT}from"../context/LangContext";
export default function Result(){
  const nav=useNavigate();const{id}=useParams();const[data,setData]=useState(null);const[loading,setLoading]=useState(true);
  const t=useT();
  useEffect(()=>{if(id)fetch(`${SERVER_URL}/api/games/${id}`).then(r=>r.json()).then(setData).catch(console.error).finally(()=>setLoading(false))},[id]);
  if(loading)return<div className="page-container text-center pt-20 text-white/20">{t("result.loading")}</div>;
  if(!data?.game)return<div className="page-container text-center pt-20 text-white/20">{t("result.matchNotFound")}</div>;
  const{game}=data;const dir=parseFloat(game.settlement_price)>parseFloat(game.base_price)?"up":"down";
  return<div className="page-container"><button onClick={()=>nav("/")} className="text-white/15 text-xs mb-4">{t("howto.back")}</button><h2 className="text-lg font-black mb-3">{t("result.matchNumber")}{game.id}</h2><div className="landing-story-card !p-5 max-w-xl"><div className="arena-mech-panel px-4 py-4"><div className="flex justify-between mb-2"><span className="text-white/20 text-xs">{t("result.base")}</span><span className="font-mono text-sm">${parseFloat(game.base_price).toLocaleString()}</span></div><div className="flex justify-between"><span className="text-white/20 text-xs">{t("result.settlement")}</span><span className={`font-mono font-bold text-sm ${dir==="up"?"text-emerald-400":"text-rose-400"}`}>${parseFloat(game.settlement_price).toLocaleString()}</span></div></div></div></div>;
}
