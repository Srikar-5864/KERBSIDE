import {useEffect,useRef,useState} from 'react';
import {supabase} from '../lib/supabase';import {useAuth} from '../auth';import {useComplaints} from '../lib/useComplaints';
import {COLOR,Complaint,DEPOT} from '../lib/types';import {orderPrioritizedRoute} from '../lib/route';import MapView,{Pt} from '../MapView';
import FilePicker from '../components/FilePicker';
import {ReportBadges} from '../components/Badges';
import ComplaintDetails from '../components/ComplaintDetails';
import {captureCleanupLocation,CleanupLocation} from '../lib/geolocation';
import {CleanupDraft} from '../lib/drafts';
import {useCleanupDrafts} from '../lib/useCleanupDrafts';
import Icon from '../components/Icon';
import StatCard from '../components/StatCard';
import EmptyState from '../components/EmptyState';
import {Link} from 'react-router-dom';

function targetClearText(dueAt:string|null|undefined):string{
 if(!dueAt)return '';
 const diff=Math.round((new Date(dueAt).getTime()-Date.now())/3600000);
 if(diff>0)return `Target: clear within ${diff} h`;
 if(diff===0)return 'Target: clear within <1 h';
 return `Target: overdue by ${Math.abs(diff)} h`;
}

function Job({r,n,save,pending,locate}:{r:Complaint;n:number;save:(draft:CleanupDraft)=>Promise<void>;pending:boolean;locate:()=>Promise<CleanupLocation>}){
 const {profile}=useAuth();
 const [note,setNote]=useState(''),[file,setFile]=useState<File|null>(null),[err,setErr]=useState(''),[busy,setBusy]=useState(false);

 async function clear(){
  if(!note.trim()||note.trim().length>2000)return setErr('Add a resolution remark (1 to 2000 characters).');
  if(!file)return setErr('Add a completion photo as proof of cleanup.');
  if(!profile)return setErr('Sign in again before clearing this report.');
  setBusy(true);setErr('');
  try{
   const location=await locate();
   await save({id:crypto.randomUUID(),userId:profile.id,reportId:r.id,note:note.trim(),file,location,createdAt:new Date().toISOString()});
   setNote('');setFile(null);
  }catch(e){setErr(e instanceof Error?e.message:'Unable to save cleanup. Please retry.')}finally{setBusy(false)}
 }

 return <li className="item job">
  <div className="job-heading"><span className="job-number">{n}</span><div className="job-copy"><span className="report-reference">REPORT #{r.id.slice(0,6).toUpperCase()}</span><h3>{r.category}</h3><p>{r.description}</p><ReportBadges status={r.status} priority={r.priority}/></div></div>
  <div className="job-deadline"><Icon name="clock" size={16}/>{targetClearText(r.due_at)}</div>
  {r.image_url&&<img className="job-photo" src={r.image_url} alt="Reported waste" loading="lazy"/>}
  {pending?<div className="route-status"><Icon name="cloud" size={18}/><p>Cleanup saved for sync. Your photo and GPS tag are safe on this device.</p></div>:<details className="cleanup-form"><summary>Record cleanup</summary>
   <label htmlFor={`remark-${r.id}`}>Resolution remark</label><input id={`remark-${r.id}`} type="text" aria-label="Resolution remark" placeholder="Describe what the crew cleared" value={note} maxLength={2000} disabled={busy} onChange={e=>setNote(e.target.value)}/>
   <FilePicker label="Completion photo (required)" file={file} onChange={setFile} id={`crew-photo-${r.id}`}/>
   <div className="geofence-note"><Icon name="shield" size={18}/><span>Capture GPS within <b>100 metres</b> of the report pin. Photos and GPS tags can be saved offline.</span></div>
   {err&&<p className="msg err" role="alert">{err}</p>}
   <button className="btn success full" disabled={busy} onClick={clear}><Icon name={busy?'pin':'check'} size={18}/>{busy?'Finding GPS & saving (up to 60s)…':'Mark cleared'}</button>
  </details>}
  <ComplaintDetails report={r}/>
 </li>;
}

export default function Crew({view='route'}:{view?:string}){
 const {profile}=useAuth(),{rows,load}=useComplaints();
 const queue=useCleanupDrafts(profile!.id,load);
 const [queueMessage,setQueueMessage]=useState('');
 async function discardCleanup(id:string){
  if(!window.confirm('Discard this local cleanup photo and GPS tag?'))return;
  try{await queue.remove(id)}catch{setQueueMessage('Unable to discard. Please retry.')}
 }
 const [start,setStart]=useState<[number,number]>(DEPOT);
 const [paused,setPaused]=useState(false);
 const [manualPos,setManualPos]=useState(false);
 const [statusMsg,setStatusMsg]=useState('Connecting GPS…');
 const [isErrorMsg,setIsErrorMsg]=useState(false);
 const lastSent=useRef<number>(0);
 const latestPosition=useRef<GeolocationPosition|null>(null);

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
    latestPosition.current=pos;
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
     setStatusMsg(err.code===1?'Allow location access in your browser to use GPS.':err.code===3?'Still waiting for GPS. Keep location services enabled and try an open area.':'Location is unavailable. Check device location services or set your route start on the map.');
     setIsErrorMsg(true);
    }
   },
   {enableHighAccuracy:true,timeout:60000,maximumAge:30000}
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

 const completed=rows.filter(r=>r.collector_id===profile?.id&&r.status==='cleared');
 const overdue=mine.filter(r=>r.due_at&&new Date(r.due_at).getTime()<Date.now());
 const saved=<div className="panel"><div className="panel-heading split"><div><h2>Saved cleanups ({queue.drafts.length})</h2><p>Your photos and GPS tags stay on this device until the cleanup is confirmed.</p></div><span className="count-pill">{queue.online?'Online':'Offline'}</span></div>
  {(queue.error||queueMessage)&&<p className="msg err" role="alert">{queue.error||queueMessage}</p>}
  {queue.busy&&<p className="msg" role="status">Syncing cleanup evidence…</p>}
  {!queue.drafts.length&&<EmptyState title="Everything is in sync" message="Cleanups saved offline will appear here until they reach the city office." icon="cloud"/>}
  <ul className="list">{queue.drafts.map(draft=><li className="item saved-report" key={draft.id}><b>{rows.find(r=>r.id===draft.reportId)?.category||'Saved cleanup'}</b><small>{draft.note}</small><small>GPS {draft.location.lat.toFixed(5)}, {draft.location.lng.toFixed(5)} · ±{Math.round(draft.location.accuracy)} m</small><small>Captured {new Date(draft.location.capturedAt).toLocaleString()}</small>{draft.error&&<p className="msg err">{draft.error}</p>}<div className="detail-actions"><button className="btn ghost" disabled={queue.busy} onClick={()=>discardCleanup(draft.id)}>Discard saved cleanup</button></div></li>)}</ul>
  {queue.drafts.length>0&&<button className="btn hi mt" disabled={queue.busy||!queue.online} onClick={queue.sync}><Icon name="refresh" size={17}/>Retry saved cleanups</button>}
 </div>;
 return <>
  <div className="page-heading"><div><p className="eyebrow">FIELD OPERATIONS</p><h1>{view==='completed'?'Good work, on the record.':view==='saved'?'Ready to reconnect.':'Your route, ready to go.'}</h1><p>{view==='completed'?'A look back at the cleanups you’ve completed.':view==='saved'?'Offline proof stays with you until it can be safely sent.':'The right priority. The next stop. A cleaner neighborhood.'}</p></div><button className="btn ghost" onClick={load}><Icon name="refresh" size={17}/>Refresh jobs</button></div>
  {view==='saved'?saved:view==='completed'?<>
   <div className="metrics-grid"><StatCard label="Cleanups completed" value={completed.length} hint="Every cleanup makes a difference" icon="check"/><StatCard label="Completed this week" value={completed.filter(r=>r.cleared_at&&new Date(r.cleared_at).getTime()>=Date.now()-7*86400000).length} hint="Over the last 7 days" icon="leaf"/></div>
   {!completed.length?<div className="panel"><EmptyState title="Your first cleanup is ahead" message="Complete an assigned job with a photo and GPS tag to see it here." icon="check"><Link className="btn hi" to="/app?view=route">View your route</Link></EmptyState></div>:<ul className="list completed-grid">{completed.map(r=><li className="item report-card" key={r.id}><div className="report-card-main"><span className="report-thumbnail status-cleared"><Icon name="check" size={24}/></span><div><span className="report-reference">REPORT #{r.id.slice(0,6).toUpperCase()}</span><h3>{r.category}</h3><small>{r.cleared_at?new Date(r.cleared_at).toLocaleDateString():''}</small></div></div><p className="detail-hint">{r.resolution_note||r.description}</p><ComplaintDetails report={r}/></li>)}</ul>}
  </>:<>
   <div className="metrics-grid"><StatCard label="Assigned jobs" value={mine.length} hint="Ordered by priority and distance" icon="truck"/><StatCard label="High priority" value={mine.filter(r=>r.priority==='high').length} hint="Start with the most urgent issues" icon="reports" tone="amber"/><StatCard label="Past target time" value={overdue.length} hint="Need a little extra attention" icon="clock" tone="red"/><StatCard label="Saved cleanups" value={queue.drafts.length} hint="Proof waiting to sync" icon="cloud" tone="blue"/></div>
   {queue.drafts.length>0&&<Link className="queue-notice" to="/app?view=saved"><Icon name="cloud"/><span><b>{queue.drafts.length} saved {queue.drafts.length===1?'cleanup':'cleanups'}</b> waiting to sync</span><span>View saved cleanups</span></Link>}
   <div className="crew-route-grid"><div><div className="panel-heading split"><div><h2>Today’s jobs ({mine.length})</h2><p>Follow the suggested order, starting with high priority.</p></div><span className="count-pill">{mine.length} stops</span></div><ul className="list">{mine.map((r,i)=><Job key={r.id} r={r} n={i+1} save={queue.save} pending={queue.drafts.some(d=>d.reportId===r.id)} locate={()=>captureCleanupLocation(r,latestPosition.current)}/>)}</ul>{!mine.length&&<div className="panel"><EmptyState title="You’re all caught up" message="New assignments will appear here as reports come in." icon="check"/></div>}</div>
    <div className="route-map-column"><div className="panel map-panel"><div className="panel-heading split"><div><h2>Your collection route</h2><p>Tap the map to adjust your starting point.</p></div><Icon name="pin"/></div><MapView height={390} route={path} points={mapPoints} onPick={handleMapPick}/><div className="map-legend"><span><i style={{background:'#14233a'}}/>Your starting point</span><span><i style={{background:'#2b6cff'}}/>Assigned job</span><span><i style={{background:'#c8402f'}}/>High priority</span></div><div className={`route-status ${isErrorMsg?'is-error':''}`} role="status"><Icon name={paused?'clock':'pin'} size={18}/><p>{!queue.online?'Offline. GPS and cleanup proof can still be saved on this device.':statusMsg}</p></div><div className="route-controls"><button className="btn ghost" onClick={togglePause}>{paused?'Resume sharing':'Pause sharing'}</button>{manualPos&&<button className="btn ghost" onClick={resumeGps}>Use GPS again</button>}</div></div><div className="help-card"><Icon name="shield" size={24}/><div><h3>Proof, right at the source.</h3><p>Each cleanup needs a photo, a short remark, and an accurate GPS tag within 100 metres of the pin.</p></div></div></div>
   </div>
  </>}
 </>;
}
