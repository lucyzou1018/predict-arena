import{useEffect,useState}from"react";

const DURATION=2400;
const PARTICLES=Array.from({length:28});

function TriangleMark({className="w-full h-full"}){
  return(
    <svg viewBox="241 173 316 263" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true" shapeRendering="geometricPrecision">
      <defs>
        <linearGradient id="rt-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#22d3ee"/>
          <stop offset="55%" stopColor="#a855f7"/>
          <stop offset="100%" stopColor="#ec4899"/>
        </linearGradient>
        <filter id="rt-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.4" result="b"/>
          <feMerge>
            <feMergeNode in="b"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      <g filter="url(#rt-glow)" fill="url(#rt-grad)">
        <path d="M399.238 173L477.369 301.477L435.062 324.852L397.587 259.017L339.709 353.473L397.685 319.904L412.7 347.11L486.396 308.137L408.88 390.65L389.423 357.887L241 436L399.238 173Z"/>
        <path d="M487.326 321.956L557 435.873L460.913 387.652L446.745 365.522L487.326 321.956Z"/>
      </g>
    </svg>
  );
}

export function RoomTransition({visible,onComplete,duration=DURATION}){
  const[progress,setProgress]=useState(0);

  useEffect(()=>{
    if(!visible){setProgress(0);return;}
    const start=performance.now();
    let raf;
    const tick=(t)=>{
      const p=Math.min(1,(t-start)/duration);
      const eased=p<0.5?2*p*p:1-Math.pow(-2*p+2,2)/2;
      setProgress(eased);
      if(p<1)raf=requestAnimationFrame(tick);
      else if(typeof onComplete==="function")onComplete();
    };
    raf=requestAnimationFrame(tick);
    return()=>{if(raf)cancelAnimationFrame(raf);};
  },[visible,duration,onComplete]);

  if(!visible)return null;
  const pct=Math.round(progress*100);

  return(
    <div className="room-transition-root" role="dialog" aria-modal="true" aria-label="Entering Arena">
      <div className="room-transition-bg"/>
      <div className="room-transition-grid"/>
      <div className="room-transition-particles">
        {PARTICLES.map((_,i)=>(
          <span key={i} className="room-transition-particle" style={{"--pt-angle":`${(360/PARTICLES.length)*i}deg`,"--pt-delay":`${(i%8)*90}ms`,"--pt-dur":`${1200+(i%6)*120}ms`}}/>
        ))}
      </div>
      <div className="room-transition-center">
        <div className="room-transition-rings">
          <span className="room-transition-ring r1"/>
          <span className="room-transition-ring r2"/>
          <span className="room-transition-ring r3"/>
        </div>
        <div className="room-transition-logo">
          <TriangleMark/>
        </div>
        <div className="room-transition-label">ENTERING ARENA</div>
        <div className="room-transition-subtitle">Syncing room state and preparing your seat</div>
      </div>
      <div className="room-transition-footer">
        <div className="room-transition-meta">
          <span className="room-transition-tag"><span className="dot"/>LINK ESTABLISHED</span>
          <span className="room-transition-pct">{String(pct).padStart(3,"0")}%</span>
        </div>
        <div className="room-transition-bar">
          <div className="room-transition-bar-fill" style={{width:`${pct}%`}}/>
        </div>
      </div>
    </div>
  );
}

export default RoomTransition;
