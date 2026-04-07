import{useEffect,useState}from"react";import{useNavigate,useParams}from"react-router-dom";
export default function Result(){
  const nav=useNavigate();const{id}=useParams();const[data,setData]=useState(null);const[loading,setLoading]=useState(true);
  useEffect(()=>{if(id)fetch(`http://localhost:3001/api/games/${id}`).then(r=>r.json()).then(setData).catch(console.error).finally(()=>setLoading(false))},[id]);
  if(loading)return<div className="page-container text-center pt-20 text-white/20">Loading...</div>;
  if(!data?.game)return<div className="page-container text-center pt-20 text-white/20">Game not found</div>;
  const{game}=data;const dir=parseFloat(game.settlement_price)>parseFloat(game.base_price)?"up":"down";
  return<div className="page-container"><button onClick={()=>nav("/")} className="text-white/15 text-xs mb-4">← Back</button><h2 className="text-lg font-black mb-3">Game #{game.id}</h2><div className="card"><div className="flex justify-between mb-2"><span className="text-white/20 text-xs">Base</span><span className="font-mono text-sm">${parseFloat(game.base_price).toLocaleString()}</span></div><div className="flex justify-between"><span className="text-white/20 text-xs">Settlement</span><span className={`font-mono font-bold text-sm ${dir==="up"?"text-emerald-400":"text-rose-400"}`}>${parseFloat(game.settlement_price).toLocaleString()}</span></div></div></div>;
}
