import {useCallback,useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';
import {useAuth} from '../auth';
import {levelFor} from '../lib/levels';
import {COLOR,Priority} from '../lib/types';
import MapView,{Pt} from '../MapView';
import {ReportBadges} from '../components/Badges';

export interface NearbyComplaint {
 id:string;
 category:string;
 description:string;
 lat:number;
 lng:number;
 status:string;
 priority:Priority;
 due_at:string;
 support:number;
 voters:number;
 created_at:string;
 voted:boolean;
 mine:boolean;
}

function timeAgo(dateStr:string):string{
 const s=Math.floor((Date.now()-new Date(dateStr).getTime())/1000);
 if(s<60)return 'just now';
 const m=Math.floor(s/60);
 if(m<60)return `${m}m ago`;
 const h=Math.floor(m/60);
 if(h<24)return `${h}h ago`;
 const d=Math.floor(h/24);
 return `${d}d ago`;
}

function targetClearText(dueAt:string):string{
 const diff=Math.round((new Date(dueAt).getTime()-Date.now())/3600000);
 if(diff>0)return `Target: clear within ${diff} h`;
 if(diff===0)return 'Target: clear within <1 h';
 return `Target: overdue by ${Math.abs(diff)} h`;
}

export default function Community(){
 const {profile,refresh:refreshProfile}=useAuth();
 const [center,setCenter]=useState<[number,number]|null>(null);
 const [locError,setLocError]=useState('');
 const [reports,setReports]=useState<NearbyComplaint[]>([]);
 const [loading,setLoading]=useState(false);
 const [actionMsg,setActionMsg]=useState({t:'',c:''});
 const [votingId,setVotingId]=useState<string|null>(null);
 const weight=levelFor(profile?.points||0).weight;

 const loadNearby=useCallback(async(lat:number,lng:number)=>{
  setLoading(true);
  const {data,error}=await supabase.rpc('nearby_complaints',{p_lat:lat,p_lng:lng});
  setLoading(false);
  if(error){
   setActionMsg({t:error.message,c:'err'});
  }else{
   setReports((data??[]) as NearbyComplaint[]);
  }
 },[]);

 useEffect(()=>{
  if(!navigator.geolocation){
   setLocError('Geolocation is not supported by your browser. Tap the map to select your location.');
   setCenter([12.9716,77.5946]);
   loadNearby(12.9716,77.5946);
   return;
  }
  navigator.geolocation.getCurrentPosition(
   pos=>{
    const c:[number,number]=[pos.coords.latitude,pos.coords.longitude];
    setCenter(c);
    setLocError('');
    loadNearby(c[0],c[1]);
   },
   ()=>{
    setLocError('Location access was denied or unavailable. Tap the map to set your location.');
    const fallback:[number,number]=[12.9716,77.5946];
    setCenter(fallback);
    loadNearby(fallback[0],fallback[1]);
   },
   {timeout:10000}
  );
 },[loadNearby]);

 // 15-second polling interval
 useEffect(()=>{
  if(!center)return;
  const timer=setInterval(()=>{
   loadNearby(center[0],center[1]);
  },15000);
  return()=>clearInterval(timer);
 },[center,loadNearby]);

 async function handleVote(r:NearbyComplaint){
  if(!center)return;
  setVotingId(r.id);
  setActionMsg({t:'',c:''});
  const {data,error}=await supabase.rpc('cast_vote',{
   p_complaint:r.id,
   p_lat:center[0],
   p_lng:center[1]
  });
  setVotingId(null);
  if(error){
   setActionMsg({t:error.message,c:'err'});
  }else{
   setActionMsg({t:`Supported! Report now has ${data.support} support.`,c:'good'});
   refreshProfile();
   loadNearby(center[0],center[1]);
  }
 }

 // Pin colors by STATUS with high-priority indicator
 const mapPoints:Pt[]=reports.map(r=>({
  id:r.id,
  lat:r.lat,
  lng:r.lng,
  color:COLOR[r.status as keyof typeof COLOR]||'#2b6cff',
  label:`${r.category} (${r.priority} priority) - ${r.support} support`,
  highPriority:r.priority==='high'
 }));

 return (
  <div>
   <div style={{marginBottom:16}}>
    <h2 style={{fontSize:'1.4rem',marginBottom:4}}>Community Reports (within 2 km)</h2>
    <p className="sub" style={{marginBottom:8}}>
     Support open reports in your neighbourhood to help city crews prioritize high-impact issues.
    </p>
    {locError&&<p className="msg err" style={{margin:'6px 0'}}>{locError}</p>}
    {actionMsg.t&&<p className={`msg ${actionMsg.c}`} style={{margin:'6px 0'}} role="status">{actionMsg.t}</p>}
   </div>

   <div className="dash">
    <div>
     <MapView
      height={380}
      circle={center?{center,radiusKm:2}:null}
      pick={center}
      onPick={(lat,lng)=>{
       setCenter([lat,lng]);
       setLocError('');
       loadNearby(lat,lng);
      }}
      points={mapPoints}
     />

     {/* Legend under community map */}
     <div className="map-legend">
      <span className="map-legend-item">
       <span className="map-legend-dot" style={{backgroundColor:'#c8402f'}} aria-hidden="true"/>
       <span>Reported</span>
      </span>
      <span className="map-legend-item">
       <span className="map-legend-dot" style={{backgroundColor:'#2b6cff'}} aria-hidden="true"/>
       <span>Crew on the way</span>
      </span>
      <span className="map-legend-item">
       <span className="map-legend-high" aria-hidden="true">!</span>
       <span>High priority</span>
      </span>
     </div>

     <p style={{fontSize:'.84rem',color:'var(--mute)',marginTop:6}}>
      Showing reports within 2 km of the pin. Tap the map to reposition.
     </p>
    </div>

    <div>
     <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
      <b>Nearby Issues ({reports.length})</b>
      {loading&&<small style={{color:'var(--mute)'}}>Refreshing…</small>}
     </div>

     {reports.length===0&&!loading&&(
      <div className="panel" style={{textAlign:'center',padding:'32px 16px',color:'var(--mute)'}}>
       No open reports near you.
      </div>
     )}

     <ul className="list">
      {reports.map(r=>{
       const isAwaiting=r.category==='Other' && r.priority==='medium';
       return (
        <li className="item" key={r.id} style={{flexDirection:'column',alignItems:'stretch',gap:8}}>
         <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
          <div>
           <b style={{fontSize:'1rem'}}>{r.category}</b>
           <small style={{marginTop:2}}>{r.description}</small>
           <div style={{display:'flex',gap:8,alignItems:'center',marginTop:4,flexWrap:'wrap'}}>
            <small style={{color:'var(--mute)'}}>{timeAgo(r.created_at)}</small>
            <small style={{color:'var(--route)',fontWeight:600}}>{targetClearText(r.due_at)}</small>
           </div>
          </div>

          <ReportBadges
           status={r.status}
           priority={r.priority}
           needsReview={isAwaiting}
          />
         </div>

         <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:4,borderTop:'1px solid var(--line)',paddingTop:8}}>
          <span style={{fontSize:'.88rem',color:'var(--mute)'}}>
           Support: <b>{r.support}</b> from {r.voters} {r.voters===1?'resident':'residents'}
          </span>
          <button
           className="btn hi"
           style={{padding:'6px 14px',fontSize:'.88rem'}}
           disabled={r.voted || r.mine || votingId===r.id}
           onClick={()=>handleVote(r)}
          >
           {r.mine?'Your report':r.voted?'Supported':`Upvote (+${weight})`}
          </button>
         </div>
        </li>
       );
      })}
     </ul>
    </div>
   </div>
  </div>
 );
}
