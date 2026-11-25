import {useCallback,useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';
import {useAuth} from '../auth';
import {levelFor} from '../lib/levels';
import {COLOR,Priority} from '../lib/types';
import MapView,{Pt} from '../MapView';
import {ReportBadges} from '../components/Badges';
import Icon from '../components/Icon';
import EmptyState from '../components/EmptyState';

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

 return <>
  <div className="page-heading"><div><p className="eyebrow">A LITTLE SUPPORT GOES A LONG WAY</p><h1>Better, together.</h1><p>See what’s happening within 2 km, and help the right issues get noticed.</p></div><span className="count-pill">Your vote adds {weight} support</span></div>
  {actionMsg.t&&<p className={`msg ${actionMsg.c}`} role="status">{actionMsg.t}</p>}
  <div className="community-layout">
   <div className="panel map-panel community-map"><div className="panel-heading"><span className="section-symbol"><Icon name="pin"/></span><div><h2>Your neighborhood</h2><p>Tap the map to explore another spot nearby.</p></div></div><MapView height={400} circle={center?{center,radiusKm:2}:null} pick={center} onPick={(lat,lng)=>{setCenter([lat,lng]);setLocError('');loadNearby(lat,lng)}} points={mapPoints}/><div className="map-legend"><span><i style={{background:'#c8402f'}}/>Reported</span><span><i style={{background:'#2b6cff'}}/>Crew assigned</span><span><i style={{background:'#c8402f'}}/>High priority</span></div>{locError&&<p className="msg err" role="status">{locError}</p>}<p className="field-help">Showing open reports within 2 km of your pin.</p></div>
   <div><div className="panel-heading split"><div><h2>Nearby issues</h2><p>Support the reports that matter to your community.</p></div><span className="count-pill">{loading?'Refreshing…':`${reports.length} nearby`}</span></div>
    {!reports.length&&!loading&&<div className="panel"><EmptyState title="A quiet corner of the city" message="There are no open reports around this pin. Move the pin to explore another area." icon="leaf"/></div>}
    <ul className="list">{reports.map(r=><li className="item report-card community-report" key={r.id}><div className="report-card-main"><span className="section-symbol"><Icon name="reports"/></span><div className="report-card-copy"><span className="report-reference">{timeAgo(r.created_at)} · WITHIN 2 KM</span><h3>{r.category}</h3><p>{r.description}</p></div></div><div className="report-card-meta"><ReportBadges status={r.status} priority={r.priority} needsReview={r.category==='Other'&&r.priority==='medium'}/><span><Icon name="clock" size={15}/>{targetClearText(r.due_at)}</span></div><div className="community-support"><span><b>{r.support} support</b><br/>{r.voters} {r.voters===1?'resident':'residents'} helping this get noticed</span><button className="btn hi" disabled={r.voted||r.mine||votingId===r.id} onClick={()=>handleVote(r)}><Icon name="plus" size={16}/>{r.mine?'Your report':r.voted?'Supported':votingId===r.id?'Supporting…':`Support (+${weight})`}</button></div></li>)}</ul>
   </div>
  </div>
 </>;
}
