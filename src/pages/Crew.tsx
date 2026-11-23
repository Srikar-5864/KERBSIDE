import {useEffect,useRef,useState} from 'react';
import {supabase} from '../lib/supabase';import {useAuth} from '../auth';import {useComplaints} from '../lib/useComplaints';
import {COLOR,Complaint,DEPOT} from '../lib/types';import {orderPrioritizedRoute} from '../lib/route';import MapView,{Pt} from '../MapView';
import FilePicker from '../components/FilePicker';
import {ReportBadges} from '../components/Badges';

function targetClearText(dueAt:string|null|undefined):string{
 if(!dueAt)return '';
 const diff=Math.round((new Date(dueAt).getTime()-Date.now())/3600000);
 if(diff>0)return `Target: clear within ${diff} h`;
 if(diff===0)return 'Target: clear within <1 h';
 return `Target: overdue by ${Math.abs(diff)} h`;
}

function Job({r,n,done}:{r:Complaint;n:number;done:()=>void}){
 const [note,setNote]=useState(''),[file,setFile]=useState<File|null>(null),[err,setErr]=useState(''),[busy,setBusy]=useState(false);

 async function clear(){
  if(!note.trim())return setErr('Add a resolution remark first.');
  setBusy(true);let url:string|null=null;
  if(file){
   const path=`done/${r.id}-${file.name.replace(/[^\w.-]/g,'_')}`;
   const up=await supabase.storage.from('photos').upload(path,file,{upsert:true});
   if(up.error){setBusy(false);return setErr(up.error.message)}
   url=supabase.storage.from('photos').getPublicUrl(path).data.publicUrl;
  }
  const {error}=await supabase.from('complaints').update({
   status:'cleared',
   resolution_note:note.trim(),
   done_image_url:url,
   cleared_at:new Date().toISOString()
  }).eq('id',r.id);
  setBusy(false);
  if(error)return setErr(error.message);
  done();
 }

 return (
  <li className="item job">
   <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8,width:'100%'}}>
    <div>
     <b>{n}. {r.category}</b>
     <small style={{display:'block',marginTop:2}}>{r.description}</small>
     <div style={{display:'flex',gap:8,alignItems:'center',marginTop:4,flexWrap:'wrap'}}>
      <small style={{color:'var(--route)',fontWeight:600}}>{targetClearText(r.due_at)}</small>
     </div>
    </div>
    <ReportBadges status={r.status} priority={r.priority} />
   </div>

   {r.image_url&&<img src={r.image_url} alt="Reported waste" loading="lazy" style={{maxHeight:160,objectFit:'cover'}}/>}

   <input
    type="text"
    aria-label="Resolution remark"
    placeholder="Resolution remark (required)"
    value={note}
    onChange={e=>setNote(e.target.value)}
   />

   {/* Reusable FilePicker */}
   <FilePicker
    label="Completion photo (optional)"
    file={file}
    onChange={setFile}
    id={`crew-photo-${r.id}`}
   />

   {err&&<p className="msg err" role="alert">{err}</p>}

   {/* Full width success button */}
   <button className="btn success full" disabled={busy} onClick={clear}>
    Mark cleared
   </button>
  </li>
 );
}

export default function Crew(){
 const {profile}=useAuth(),{rows,load}=useComplaints();
 const [start,setStart]=useState<[number,number]>(DEPOT);
 const [paused,setPaused]=useState(false);
 const [manualPos,setManualPos]=useState(false);
 const [statusMsg,setStatusMsg]=useState('Connecting GPS…');
 const [isErrorMsg,setIsErrorMsg]=useState(false);
 const lastSent=useRef<number>(0);

 // Location watcher
 useEffect(()=>{
  if(paused)return;
  if(!navigator.geolocation){
   setStatusMsg('Geolocation not supported. Tap the map to set your location.');
   setIsErrorMsg(true);
   return;
  }

  const id=navigator.geolocation.watchPosition(
   pos=>{
    const lat=pos.coords.latitude,lng=pos.coords.longitude;
    if(!manualPos){
     setStart([lat,lng]);
    }
    const now=Date.now();
    if(now-lastSent.current>=30000){
     lastSent.current=now;
     supabase.rpc('update_my_location',{p_lat:lat,p_lng:lng});
     setStatusMsg('Live location shared with the city office');
     setIsErrorMsg(false);
    }else if(!manualPos){
     setStatusMsg('Live location shared with the city office');
     setIsErrorMsg(false);
    }
   },
   err=>{
    if(!manualPos){
     setStatusMsg('Location is blocked or unavailable. Tap the map to set your location.');
     setIsErrorMsg(true);
    }
   },
   {enableHighAccuracy:true,timeout:15000,maximumAge:10000}
  );

  return()=>navigator.geolocation.clearWatch(id);
 },[paused,manualPos]);

 async function togglePause(){
  if(!paused){
   setPaused(true);
   setStatusMsg('Location sharing paused. Not currently matched by distance.');
   setIsErrorMsg(false);
   await supabase.rpc('pause_my_location');
  }else{
   setPaused(false);
   lastSent.current=0;
   setStatusMsg('Resuming live location sharing…');
   setIsErrorMsg(false);
  }
 }

 async function handleMapPick(lat:number,lng:number){
  setStart([lat,lng]);
  setManualPos(true);
  setStatusMsg(`Manual location set (${lat.toFixed(4)}, ${lng.toFixed(4)}). GPS override paused.`);
  setIsErrorMsg(false);
  if(!paused){
   lastSent.current=Date.now();
   await supabase.rpc('update_my_location',{p_lat:lat,p_lng:lng});
  }
 }

 function resumeGps(){
  setManualPos(false);
  setStatusMsg('Resumed GPS tracking.');
  setIsErrorMsg(false);
  navigator.geolocation?.getCurrentPosition(pos=>{
   setStart([pos.coords.latitude,pos.coords.longitude]);
  });
 }

 const mine=orderPrioritizedRoute(start,rows.filter(r=>r.collector_id===profile?.id&&r.status==='assigned'));
 const path:[number,number][]=[start,...mine.map(r=>[r.lat,r.lng] as [number,number])];

 const mapPoints:Pt[]=[
  {
   id:'you',
   lat:start[0],
   lng:start[1],
   color:'#14233a',
   label:'You (start position)',
   ring:true
  },
  ...mine.map((r,i)=>({
   id:r.id,
   lat:r.lat,
   lng:r.lng,
   color:COLOR[r.status]||'#2b6cff',
   label:`${i+1}. ${r.category} (${r.priority} priority)`,
   highPriority:r.priority==='high'
  }))
 ];

 return (
  <div className="dash">
   <div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:8,marginBottom:8}}>
     <div>
      <h2 style={{fontSize:'1.4rem',margin:0}}>Today’s jobs ({mine.length})</h2>
      <p className="sub" style={{marginBottom:0}}>Ordered by priority (High, Medium, Low) and shortest route.</p>
     </div>
     <div style={{display:'flex',gap:6}}>
      <button className="btn ghost" style={{padding:'6px 14px',fontSize:'.85rem'}} onClick={togglePause}>
       {paused?'Resume sharing':'Pause sharing'}
      </button>
      {manualPos&&(
       <button className="btn ghost" style={{padding:'6px 14px',fontSize:'.85rem'}} onClick={resumeGps}>
        Use GPS again
       </button>
      )}
     </div>
    </div>

    {/* Neutral amber for paused, red only for errors */}
    <p
     className={`msg ${isErrorMsg ? 'err' : paused ? 'warn' : 'info'}`}
     style={{
      margin:'4px 0 16px',
      fontSize:'.88rem',
      fontWeight:500,
      color: isErrorMsg ? 'var(--bad)' : paused ? '#d97706' : 'var(--mute)'
     }}
    >
     {statusMsg}
    </p>

    <ul className="list">
     {mine.length===0&&<li className="item">No open jobs. New assignments appear here live.</li>}
     {mine.map((r,i)=><Job key={r.id} r={r} n={i+1} done={load}/>)}
    </ul>
   </div>

   <div>
    <MapView height={460} route={path} points={mapPoints} onPick={handleMapPick}/>

    {/* Crew Map Legend */}
    <div className="map-legend">
     <span className="map-legend-item">
      <span className="map-legend-dot" style={{backgroundColor:'#2b6cff'}} aria-hidden="true"/>
      <span>Assigned job</span>
     </span>
     <span className="map-legend-item">
      <span className="map-legend-ring" aria-hidden="true"/>
      <span>You (start)</span>
     </span>
     <span className="map-legend-item">
      <span className="map-legend-high" aria-hidden="true">!</span>
      <span>High priority</span>
     </span>
    </div>

    <p style={{fontSize:'.84rem',color:'var(--mute)',marginTop:6}}>
     Dark ring shows your position. Tap map anytime to adjust starting location by hand.
    </p>
   </div>
  </div>
 );
}
