import {Link} from 'react-router-dom';
import {FormEvent,useCallback,useEffect,useRef,useState} from 'react';
import {useAuth} from '../auth';import {useComplaints} from '../lib/useComplaints';
import {CATEGORIES,COLOR,LABEL} from '../lib/types';import MapView from '../MapView';
import FilePicker from '../components/FilePicker';
import {ReportBadges} from '../components/Badges';
import Community from './Community';
import ComplaintDetails from '../components/ComplaintDetails';
import SavedReports from '../components/SavedReports';
import {useReportDrafts} from '../lib/useReportDrafts';
import Icon from '../components/Icon';
import StatCard from '../components/StatCard';
import EmptyState from '../components/EmptyState';

function targetClearText(dueAt:string|null|undefined):string{
 if(!dueAt)return '';
 const diff=Math.round((new Date(dueAt).getTime()-Date.now())/3600000);
 if(diff>0)return `Target: clear within ${diff} h`;
 if(diff===0)return 'Target: clear within <1 h';
 return `Target: overdue by ${Math.abs(diff)} h`;
}

export default function Citizen({view='overview'}:{view?:string}){
 const {profile,refresh}=useAuth(),{rows,load}=useComplaints();
 const [filter,setFilter]=useState('all');
 const [cat,setCat]=useState(CATEGORIES[0]),[desc,setDesc]=useState(''),[file,setFile]=useState<File|null>(null);
 const [pick,setPick]=useState<[number,number]|null>(null),[msg,setMsg]=useState({t:'',c:''}),[busy,setBusy]=useState(false);
 const sent=useCallback(()=>{refresh();load()},[refresh,load]);
 const queue=useReportDrafts(profile!.id,sent);
 const seen=useRef<Record<string,string>>({});

 useEffect(()=>{
  rows.forEach(r=>{
   const p=seen.current[r.id];
   if(p&&p!==r.status){
    setMsg({t:`Your ${r.category.toLowerCase()} report is now: ${LABEL[r.status]}.`,c:'good'});
    refresh();
   }
   seen.current[r.id]=r.status;
  });
 },[rows,refresh]);

 function locate(){
  if(!navigator.geolocation)return setMsg({t:'GPS is unavailable. Tap the map to place the pin.',c:'err'});
  navigator.geolocation?.getCurrentPosition(
   p=>setPick([p.coords.latitude,p.coords.longitude]),
   ()=>setMsg({t:'Location is blocked. Tap the map to place the pin instead.',c:'err'}),
   {enableHighAccuracy:true,maximumAge:0,timeout:20000}
  );
 }

 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  const form=e.currentTarget;
  if(!pick)return setMsg({t:'Tap the map or use your location to place the pin.',c:'err'});
  if(!desc.trim()||desc.trim().length>2000)return setMsg({t:'Add a short note so the crew knows what to look for.',c:'err'});

  setBusy(true);setMsg({t:'',c:''});
  try{
   await queue.save({id:crypto.randomUUID(),userId:profile!.id,category:cat,description:desc.trim(),lat:pick[0],lng:pick[1],file,createdAt:new Date().toISOString()});
   form.reset();setDesc('');setFile(null);setPick(null);
   setMsg({t:queue.online?'Report saved. Sending now; check Saved reports for progress.':'Report and photo saved on this device. They will send when this app reconnects.',c:'good'});
   await queue.sync();
  }catch(e){setMsg({t:e instanceof Error?e.message:'Could not save your report. Keep this form open and retry.',c:'err'})}finally{setBusy(false)}
 }

 const active=rows.filter(r=>r.status==='reported'||r.status==='assigned');
 const cleared=rows.filter(r=>r.status==='cleared');
 const visible=rows.filter(r=>filter==='all'||(filter==='open'?r.status==='reported'||r.status==='assigned':r.status===filter));
 const points=rows.map(r=>({id:r.id,lat:r.lat,lng:r.lng,color:COLOR[r.status],label:`${r.category}: ${LABEL[r.status]}`,highPriority:r.priority==='high'}));
 if(view==='community')return <Community/>;
 if(view==='saved')return <><div className="page-heading"><div><p className="eyebrow">READY WHEN YOU ARE</p><h1>Saved reports</h1><p>Your drafts stay safe, even when your connection doesn’t.</p></div><Link className="btn hi" to="/app?view=report"><Icon name="plus"/>New report</Link></div><SavedReports queue={queue}/></>;
 if(view==='report')return <>
  <div className="page-heading"><div><p className="eyebrow">MAKE A DIFFERENCE</p><h1>Report an issue</h1><p>A little detail helps the right crew get to the right place.</p></div><Link className="btn ghost" to="/app?view=overview">Your reports</Link></div>
  <form className="report-builder" onSubmit={submit}>
   <div className="panel form-panel">
    <div className="panel-heading"><span className="section-symbol"><Icon name="reports"/></span><div><h2>What needs attention?</h2><p>Tell us what you spotted in your neighborhood.</p></div></div>
    <label htmlFor="c">Issue category</label><select id="c" value={cat} onChange={e=>setCat(e.target.value)}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select>
    <label htmlFor="n">Short note</label><textarea id="n" value={desc} onChange={e=>setDesc(e.target.value)} maxLength={2000} placeholder="For example: a pile of waste beside the north gate, blocking the footpath." rows={5}/>
    <span className="field-help">Describe the spot and anything the crew should know.</span>
    <div className="photo-field"><FilePicker label="Add a photo (optional)" file={file} onChange={setFile} id="citizen-photo-picker"/><p className="field-help">A clear photo helps us assess the issue. Images up to 5 MB.</p></div>
    {msg.t&&<p className={`msg ${msg.c}`} role="status">{msg.t}</p>}
    <div className="form-footer"><span><Icon name="shield" size={17}/>Saved safely before sending</span><button className="btn hi" disabled={busy||queue.busy}><Icon name={queue.online?'plus':'cloud'}/>{busy?'Saving…':queue.online?'Send report':'Save report offline'}</button></div>
   </div>
   <div className="report-location-column">
    <div className="panel map-panel"><div className="panel-heading"><span className="section-symbol"><Icon name="pin"/></span><div><h2>Pin the location</h2><p>Tap the map to mark the exact spot.</p></div></div><MapView height={330} pick={pick} onPick={(a,b)=>setPick([a,b])} points={points}/><div className="location-actions"><span className={pick?'location-ready':'field-help'}>{pick?`Pin: ${pick[0].toFixed(5)}, ${pick[1].toFixed(5)}`:'No location selected yet'}</span><button type="button" className="btn ghost" disabled={busy} onClick={locate}><Icon name="pin" size={17}/>Use my location</button></div></div>
    <div className="help-card"><Icon name="leaf" size={25}/><div><h3>Your report makes a difference</h3><p>We’ll match your report to a crew. Track its progress, ask questions, and see the cleanup photos from your dashboard.</p></div></div>
   </div>
  </form>
 </>;
 return <>
  <div className="page-heading"><div><p className="eyebrow">YOUR NEIGHBORHOOD, A LITTLE BETTER</p><h1>Hello, {profile?.name?.split(' ')[0]||'neighbor'}<span className="heading-accent">.</span></h1><p>Keep track of the changes you’re helping make.</p></div><Link className="btn hi" to="/app?view=report"><Icon name="plus"/>New report</Link></div>
  <div className="metrics-grid">
   <StatCard label="Your reports" value={rows.length} hint="Every report starts a change" icon="reports"/>
   <StatCard label="In progress" value={active.length} hint="Reported or assigned to a crew" icon="clock" tone="amber"/>
   <StatCard label="Cleanups completed" value={cleared.length} hint="A cleaner place for everyone" icon="check"/>
   <StatCard label="Community points" value={profile?.points||0} hint="Earned for your contribution" icon="leaf" tone="blue"/>
  </div>
  {msg.t&&<p className={`msg ${msg.c}`} role="status">{msg.t}</p>}
  {queue.drafts.length>0&&<Link className="queue-notice" to="/app?view=saved"><Icon name="cloud"/><span><b>{queue.drafts.length} saved {queue.drafts.length===1?'report':'reports'}</b> waiting on this device</span><span>View saved reports</span></Link>}
  <div className="citizen-overview-grid">
   <div className="panel reports-panel"><div className="panel-heading split"><div><h2>Your reports</h2><p>From the first pin to the final cleanup.</p></div><span className="count-pill">{rows.length} total</span></div>
    <div className="filter-chips" aria-label="Filter your reports">{[['all','All reports'],['open','In progress'],['cleared','Cleared'],['rejected','Rejected']].map(([value,label])=><button type="button" key={value} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{label}</button>)}</div>
    <ul className="list report-list">{visible.map(r=><li className="item report-card" key={r.id} id={`report-${r.id}`}>
     <div className="report-card-main"><span className={`report-thumbnail status-${r.status}`}>{r.image_url?<img src={r.image_url} alt={r.category} loading="lazy"/>:<Icon name={r.status==='cleared'?'check':'reports'} size={24}/>}</span><div className="report-card-copy"><span className="report-reference">REPORT #{r.id.slice(0,6).toUpperCase()}</span><h3>{r.category}</h3><p>{r.description}</p></div></div>
     <div className="report-card-meta"><ReportBadges status={r.status} priority={r.status!=='rejected'?r.priority:undefined} needsReview={r.needs_review}/><span><Icon name="clock" size={15}/>{r.status==='cleared'?'Cleanup completed':r.status==='rejected'?'Review completed':targetClearText(r.due_at)}</span></div>
     <ComplaintDetails report={r}/>
    </li>)}</ul>
    {!visible.length&&<EmptyState title={rows.length?'No reports in this view':'Your first report starts here'} message={rows.length?'Try another filter to find your reports.':'Spotted something that needs a cleanup? Place a pin and let your local crew know.'}><Link className="btn hi" to="/app?view=report"><Icon name="plus"/>Report an issue</Link></EmptyState>}
   </div>
   <div className="overview-side"><div className="panel map-panel"><div className="panel-heading split"><div><h2>Your neighborhood</h2><p>Your reports, on the map.</p></div><Icon name="pin"/></div><MapView height={310} points={points}/><div className="map-legend"><span><i style={{background:'#c8402f'}}/>Reported</span><span><i style={{background:'#2b6cff'}}/>Assigned</span><span><i style={{background:'#2f7d57'}}/>Cleared</span></div></div><div className="community-invite"><span className="section-symbol"><Icon name="users"/></span><h3>Better, together.</h3><p>See what your neighbors have reported and support the issues that matter to you.</p><Link className="btn ghost" to="/app?view=community">Explore community</Link></div></div>
  </div>
 </>;
}
