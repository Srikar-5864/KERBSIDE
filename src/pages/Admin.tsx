import {FormEvent,useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {supabase,createIsolatedClient} from '../lib/supabase';
import {useComplaints} from '../lib/useComplaints';
import {CATEGORIES,COLOR,LABEL,Priority,Profile,Complaint} from '../lib/types';
import MapView,{Pt} from '../MapView';
import {StatusBadge,PriorityBadge,ReportBadges} from '../components/Badges';
import ComplaintDetails from '../components/ComplaintDetails';
import Hotspots from '../components/Hotspots';
import Icon from '../components/Icon';
import StatCard from '../components/StatCard';
import EmptyState from '../components/EmptyState';

interface Bin{id:string;lat:number;lng:number;fill:number}

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

function formatDuration(ms:number):string{
 if(ms<=0)return '0m';
 const totalM=Math.round(ms/60000);
 if(totalM<60)return `${totalM}m`;
 const h=Math.floor(totalM/60);
 const m=totalM%60;
 if(h<24)return m>0?`${h}h ${m}m`:`${h}h`;
 const d=Math.floor(h/24);
 const remH=h%24;
 return remH>0?`${d}d ${remH}h`:`${d}d`;
}

function targetClearText(dueAt:string|null|undefined):string{
 if(!dueAt)return '';
 const diff=Math.round((new Date(dueAt).getTime()-Date.now())/3600000);
 if(diff>0)return `Target: clear within ${diff} h`;
 if(diff===0)return 'Target: clear within <1 h';
 return `Target: overdue by ${Math.abs(diff)} h`;
}

export default function Admin({view='overview'}:{view?:string}){
 const {rows,load}=useComplaints();
 const [people,setPeople]=useState<Profile[]>([]);
 const [bins,setBins]=useState<Bin[]>([]);
 const [msg,setMsg]=useState('');

 // Filters
 const [statusFilter,setStatusFilter]=useState<string>('all');
 const [categoryFilter,setCategoryFilter]=useState<string>('all');
 const [search,setSearch]=useState('');
 const dialog=useRef<HTMLDialogElement>(null);
 const [selectedComplaint,setSelectedComplaint]=useState<Complaint|null>(null);
 useEffect(()=>{if(selectedComplaint&&!dialog.current?.open)dialog.current?.showModal();else if(!selectedComplaint)dialog.current?.close()},[selectedComplaint?.id]);

 // Priority override modal / inline state
 const [overridePriority,setOverridePriority]=useState<string>('');
 const [overrideReason,setOverrideReason]=useState<string>('');
 const [overrideBusy,setOverrideBusy]=useState<boolean>(false);

 // Collector creation form
 const [collectorName,setCollectorName]=useState('');
 const [collectorEmail,setCollectorEmail]=useState('');
 const [collectorPassword,setCollectorPassword]=useState('');
 const [collectorBusy,setCollectorBusy]=useState(false);
 const [collectorMsg,setCollectorMsg]=useState({t:'',c:''});

 const fetchAll=useCallback(async()=>{
  const [a,b]=await Promise.all([
   supabase.from('profiles').select('*'),
   supabase.from('bins').select('*')
  ]);
  setPeople((a.data??[]) as Profile[]);
  setBins((b.data??[]) as Bin[]);
 },[]);

 useEffect(()=>{
  fetchAll();
  const timer=setInterval(fetchAll,10000);
  return()=>clearInterval(timer);
 },[fetchAll]);

 const crews=people.filter(p=>p.role==='collector');
 const nameOf=(id:string|null)=>{
  const p=people.find(x=>x.id===id);
  return p?.name||p?.email||'Unassigned';
 };

 // Metrics
 const unassignedRows=rows.filter(r=>r.status==='reported');
 const overdueRows=rows.filter(r=>(r.status==='reported'||r.status==='assigned')&&r.due_at&&new Date(r.due_at).getTime()<Date.now());
 const openRows=rows.filter(r=>r.status==='reported'||r.status==='assigned');
 const oneWeekAgo=Date.now()-7*86400000;
 const clearedThisWeek=rows.filter(r=>r.status==='cleared'&&r.cleared_at&&new Date(r.cleared_at).getTime()>=oneWeekAgo);

 // Oldest 5 open complaints
 const oldestOpen=useMemo(()=>{
  return [...openRows].sort((a,b)=>new Date(a.created_at).getTime()-new Date(b.created_at).getTime()).slice(0,5);
 },[openRows]);

 // 7-day complaint history
 const dailyStats=useMemo(()=>{
  const days:Array<{dayName:string;dateStr:string;count:number}>=[];
  for(let i=6;i>=0;i--){
   const d=new Date(Date.now()-i*86400000);
   const dateKey=d.toISOString().slice(0,10);
   const dayName=d.toLocaleDateString(undefined,{weekday:'short',day:'numeric'});
   const count=rows.filter(r=>r.created_at.slice(0,10)===dateKey).length;
   days.push({dayName,dateStr:dateKey,count});
  }
  const max=Math.max(1,...days.map(d=>d.count));
  return {days,max};
 },[rows]);

 // Category share percentages
 const categoryShares=useMemo(()=>{
  const total=rows.length;
  if(!total)return [];
  return CATEGORIES.map(cat=>{
   const count=rows.filter(r=>r.category===cat).length;
   const pct=Math.round((count/total)*100);
   return {category:cat,count,pct};
  }).filter(c=>c.count>0);
 },[rows]);

 async function assign(id:string,cid:string){
  const {error}=await supabase.from('complaints').update({collector_id:cid||null,status:cid?'assigned':'reported'}).eq('id',id);
  if(error){setMsg(`Could not assign crew: ${error.message}`);return}
  load();
  fetchAll();
  if(selectedComplaint?.id===id){
   setSelectedComplaint(prev=>prev?{...prev,collector_id:cid||null,status:cid?'assigned':'reported'}:null);
  }
 }

 async function handleAutoAssign(){
  setMsg('Assigning open complaints to nearest active crews…');
  const {data,error}=await supabase.rpc('auto_assign_unassigned');
  if(error){
   setMsg(`Auto-assign error: ${error.message}`);
  }else{
   setMsg(data>0?`Successfully assigned ${data} report(s) to nearest crews.`:'No reports needed assignment.');
   load();
   fetchAll();
  }
 }

 async function handleMarkFake(id:string){
  if(!window.confirm('Are you sure you want to mark this report as fake? The report will be rejected and 5 points will be deducted from the resident.')){
   return;
  }
  const {error}=await supabase.rpc('mark_fake',{p_id:id});
  if(error){
   alert(`Failed to mark fake: ${error.message}`);
  }else{
   setMsg('Report marked as fake and resident points updated.');
   load();
   fetchAll();
   if(selectedComplaint?.id===id)setSelectedComplaint(null);
  }
 }

 async function handleSetPriority(e:FormEvent){
  e.preventDefault();
  if(!selectedComplaint)return;
  setOverrideBusy(true);
  const pVal=overridePriority==='default'?null:overridePriority||null;
  const {error}=await supabase.rpc('set_priority',{
   p_id:selectedComplaint.id,
   p_priority:pVal,
   p_reason:overrideReason.trim()||null
  });
  setOverrideBusy(false);
  if(error){
   alert(error.message);
  }else{
   setMsg('Priority override saved.');
   load();
   fetchAll();
   setSelectedComplaint(prev=>prev?{
    ...prev,
    priority:(pVal as Priority)||prev.base_priority,
    priority_override:pVal as Priority|null,
    override_reason:overrideReason.trim()||null,
    needs_review:false
   }:null);
  }
 }

 function exportCsv(){
  const esc=(v:unknown)=>'"'+String(v??'').replace(/"/g,'""')+'"';
  const csv=['id,category,description,status,priority,due_at,cleared_at,crew,lat,lng,support,voters,created'].concat(
   rows.map(r=>[
    r.id,r.category,r.description,LABEL[r.status]||r.status,r.priority,
    r.due_at,r.cleared_at||'',nameOf(r.collector_id),r.lat,r.lng,r.support,r.voters,r.created_at
   ].map(esc).join(','))
  ).join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download='kerbside-report.csv';
  a.click();URL.revokeObjectURL(a.href);
 }

 async function handleCreateCollector(e:FormEvent){
  e.preventDefault();
  if(collectorPassword.length<6)return setCollectorMsg({t:'Password must have at least 6 characters.',c:'err'});
  setCollectorBusy(true);setCollectorMsg({t:'',c:''});
  try{
   const client=createIsolatedClient();
   const {data,error}=await client.auth.signUp({
    email:collectorEmail,
    password:collectorPassword,
    options:{data:{name:collectorName,role:'collector'}}
   });
   if(error)throw error;
   if(data.user){
    const {error:roleError}=await supabase.from('profiles').update({role:'collector',name:collectorName,email:collectorEmail}).eq('id',data.user.id);
    if(roleError)throw roleError;
   }
   setCollectorMsg({t:`Collector account created for ${collectorEmail}!`,c:'good'});
   setCollectorName('');setCollectorEmail('');setCollectorPassword('');
   await fetchAll();
  }catch(err:any){
   setCollectorMsg({t:err.message||'Failed to create collector account.',c:'err'});
  }finally{
   setCollectorBusy(false);
  }
 }

 async function handleRoleChange(userId:string,newRole:'citizen'|'collector'|'admin'){
  const {error}=await supabase.from('profiles').update({role:newRole}).eq('id',userId);
  if(error){
   setMsg(`Failed to update role: ${error.message}`);
  }else{
   setMsg(`Role updated to ${newRole}.`);
   await fetchAll();
  }
 }

 // Filtered map points
 const filteredRows=rows.filter(r=>{
  if(statusFilter!=='all'&&r.status!==statusFilter)return false;
  if(categoryFilter!=='all'&&r.category!==categoryFilter)return false;
  if(search&&!`${r.category} ${r.description} ${r.id}`.toLowerCase().includes(search.toLowerCase()))return false;
  return true;
 });

 const mapPoints:Pt[]=[
  ...bins.map(b=>({
   id:b.id,
   lat:b.lat,
   lng:b.lng,
   color:b.fill>80?'#c8402f':'#f2c230',
   label:`Bin ${b.fill}% full ${b.fill>80?'(Critical)':''}`,
   small:true,
   square:true
  })),
  ...crews.filter(c=>c.lat!=null&&c.lng!=null).map(c=>{
   const lastSeen=c.location_at?new Date(c.location_at).getTime():0;
   const isRecent=Date.now()-lastSeen<30*60000;
   const openCount=rows.filter(r=>r.collector_id===c.id&&r.status==='assigned').length;
   const timeText=c.location_at?timeAgo(c.location_at):'never';
   return {
    id:`crew-${c.id}`,
    lat:c.lat!,
    lng:c.lng!,
    color:isRecent?'#14233a':'#8892a0',
    label:`${c.name||c.email||'Crew'}: ${openCount} open jobs (Seen ${timeText})`,
    ring:true
   };
  }),
  ...filteredRows.map(r=>({
   id:r.id,
   lat:r.lat,
   lng:r.lng,
   color:r.status==='rejected'?'#8892a0':COLOR[r.status]||'#2b6cff',
   label:`${r.category} [${r.priority}]: ${LABEL[r.status]||r.status}`,
   highPriority:r.priority==='high',
   onClick:()=>selectReport(r)
  }))
 ];

 function selectReport(report:Complaint){setSelectedComplaint(report);setOverridePriority(report.priority_override||'default');setOverrideReason(report.override_reason||'')}
 const selected=rows.find(r=>r.id===selectedComplaint?.id)||selectedComplaint;
 const titles:Record<string,[string,string,string]>={
  overview:['THE CITY, AT A GLANCE','A cleaner city starts here.','A clear view of the issues, crews, and cleanups that matter.'],
  reports:['EVERY REPORT COUNTS','All reports','Review issues, assign the right crew, and follow every cleanup.'],
  map:['A SHARED VIEW','City map','See reports, collection crews, and waste infrastructure in one place.'],
  hotspots:['SPOT THE PATTERNS','Recurring hotspots','Find the places that need more than a one-time cleanup.'],
  team:['THE PEOPLE BEHIND THE PROGRESS','Team & access','Coordinate collection crews and manage workspace permissions.'],
 };
 const [eyebrow,title,description]=titles[view]||titles.overview;
 const filters=<div className="admin-toolbar">
  <div className="search-field"><Icon name="search" size={17}/><input type="search" aria-label="Search reports" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search category, description, or report ID"/></div>
  <select aria-label="Filter reports by status" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="all">All statuses</option><option value="reported">Reported</option><option value="assigned">Assigned</option><option value="cleared">Cleared</option><option value="rejected">Rejected</option></select>
  <select aria-label="Filter reports by category" value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}><option value="all">All categories</option>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select>
 </div>;
 const cityMap=<div className="panel map-panel">
  <div className="panel-heading split"><div><h2>City activity</h2><p>Reports, crews, and bins. Select a report pin for details.</p></div><span className="count-pill">{openRows.length} open reports</span></div>
  {view==='map'&&filters}<MapView height={view==='map'?530:360} points={mapPoints}/>
  <div className="map-legend"><span><i style={{background:'#c8402f'}}/>Reported</span><span><i style={{background:'#2b6cff'}}/>Assigned</span><span><i style={{background:'#2f7d57'}}/>Cleared</span><span><i style={{background:'#f2c230'}}/>Bins</span><span><i style={{background:'#14233a'}}/>Active crews</span></div>
 </div>;
 return <>
  <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div><div className="detail-actions"><button className="btn ghost" onClick={()=>{load();fetchAll()}}><Icon name="refresh" size={17}/>Refresh</button>{view==='reports'&&<button className="btn hi" onClick={exportCsv}><Icon name="download" size={17}/>Export CSV</button>}</div></div>
  {msg&&<p className="msg" role="status">{msg}</p>}
  {(view==='overview'||view==='reports')&&<div className="metrics-grid">
   <StatCard label="Open reports" value={openRows.length} hint={`${rows.length} reports in total`} icon="reports"/>
   <StatCard label="Awaiting assignment" value={unassignedRows.length} hint="Ready for crew dispatch" icon="truck" tone="amber"/>
   <StatCard label="Past target time" value={overdueRows.length} hint="Need your attention" icon="clock" tone="red"/>
   <StatCard label="Cleared this week" value={clearedThisWeek.length} hint="Cleanups in the last 7 days" icon="check"/>
  </div>}
  {view==='overview'&&<>
   <div className="admin-overview-grid">{cityMap}<div className="panel"><div className="panel-heading split"><div><h2>Needs attention</h2><p>The oldest open reports.</p></div><span className="count-pill">{openRows.length} open</span></div>
    {!oldestOpen.length?<EmptyState title="All caught up" message="No open reports need attention right now." icon="check"/>:<ul className="attention-list">{oldestOpen.map(r=><li key={r.id}><span className="report-thumbnail">{r.image_url?<img src={r.image_url} alt=""/>:<Icon name="reports"/>}</span><div className="attention-copy"><button type="button" onClick={()=>selectReport(r)}><b>{r.category}</b></button><small>{timeAgo(r.created_at)} · {r.collector_id?nameOf(r.collector_id):'Unassigned'}</small></div><PriorityBadge priority={r.priority}/></li>)}</ul>}
   </div></div>
   <div className="admin-analytics-grid"><div className="panel"><div className="panel-heading split"><div><h2>Reports this week</h2><p>Incoming reports over the past 7 days.</p></div><span className="count-pill">{dailyStats.days.reduce((sum,d)=>sum+d.count,0)} reports</span></div>
    <div className="chart-bars" role="img" aria-label={dailyStats.days.map(d=>`${d.dayName}: ${d.count} reports`).join(', ')}>{dailyStats.days.map(d=><div className="chart-column" key={d.dateStr}><span>{d.count}</span><i style={{height:`${Math.max(2,d.count/dailyStats.max*130)}px`}}/></div>)}</div><div className="chart-labels" aria-hidden="true">{dailyStats.days.map(d=><span key={d.dateStr}>{new Date(`${d.dateStr}T12:00:00`).toLocaleDateString(undefined,{weekday:'short'})}</span>)}</div>
   </div><div className="panel"><div className="panel-heading"><div><h2>What’s being reported</h2><p>Issue categories across all reports.</p></div></div>{!categoryShares.length?<EmptyState title="No reports yet" message="Category insights will appear as reports come in." icon="chart"/>:categoryShares.map(item=><div className="category-row" key={item.category}><div><span>{item.category}</span><b>{item.pct}%</b></div><div className="category-track"><i style={{width:`${item.pct}%`}}/></div></div>)}</div></div>
  </>}
  {view==='map'&&cityMap}
  {view==='hotspots'&&<Hotspots/>}
  {view==='reports'&&<div className="panel"><div className="panel-heading split"><div><h2>Report queue</h2><p>Select a report to review its timeline, proof, and comments.</p></div><button className="btn hi" onClick={handleAutoAssign}><Icon name="truck" size={17}/>Auto-assign crews</button></div>
   {filters}
   <div className="table-container"><div className="scroll"><table><thead><tr><th>Report</th><th>Description</th><th>Priority</th><th>Status</th><th>Target</th><th>Assigned crew</th></tr></thead><tbody>{filteredRows.map(r=><tr key={r.id}>
    <td className="table-category"><button type="button" className="report-link" onClick={()=>selectReport(r)}>{r.category}</button><small>#{r.id.slice(0,6).toUpperCase()} · {r.voters} {r.voters===1?'resident':'residents'}</small></td><td className="table-description">{r.description}</td><td><PriorityBadge priority={r.priority} needsReview={r.needs_review}/></td><td><StatusBadge status={r.status}/></td><td><small>{r.status==='cleared'?'Completed':r.status==='rejected'?'Closed':targetClearText(r.due_at)}</small></td>
    <td>{r.status==='cleared'||r.status==='rejected'?nameOf(r.collector_id):<select aria-label={`Assign crew for ${r.category} ${r.id.slice(0,6)}`} value={r.collector_id||''} onChange={e=>assign(r.id,e.target.value)}><option value="">Unassigned</option>{crews.map(c=><option key={c.id} value={c.id}>{c.name||c.email||'Crew member'}</option>)}</select>}</td>
   </tr>)}</tbody></table>{!filteredRows.length&&<EmptyState title={rows.length?'No matching reports':'A fresh start'} message={rows.length?'Try a different search or clear the filters.':'New reports will appear here as residents send them in.'}/>}</div></div>
  </div>}
  {view==='team'&&<div className="admin-section">
   <div className="panel"><div className="panel-heading split"><div><h2>Crew performance</h2><p>Current workloads, recent cleanups, and location updates.</p></div><span className="count-pill">{crews.length} collectors</span></div>
    <div className="table-container"><div className="scroll"><table><thead><tr><th>Crew member</th><th>Open jobs</th><th>Cleared this week</th><th>Average cleanup time</th><th>Workload</th><th>Last location</th></tr></thead><tbody>{crews.map(c=>{
     const assigned=rows.filter(r=>r.collector_id===c.id&&r.status==='assigned'),cleared=rows.filter(r=>r.collector_id===c.id&&r.status==='cleared'&&r.cleared_at);
     const week=cleared.filter(r=>new Date(r.cleared_at!).getTime()>=oneWeekAgo);
     const avg=cleared.length?cleared.reduce((sum,r)=>sum+new Date(r.cleared_at!).getTime()-new Date(r.created_at).getTime(),0)/cleared.length:0;
     return <tr key={c.id}><td><div className="table-identity"><span className="avatar">{(c.name||'C')[0].toUpperCase()}</span><div><b>{c.name||'Crew member'}</b><small>{c.email}</small></div></div></td><td>{assigned.length}</td><td>{week.length}</td><td>{cleared.length?formatDuration(avg):'No completed jobs'}</td><td><div className="crew-workload"><i style={{width:`${Math.min(100,assigned.length/(openRows.length||1)*100)}%`}}/></div></td><td>{c.location_at?timeAgo(c.location_at):'Not shared yet'}</td></tr>;
    })}</tbody></table>{!crews.length&&<EmptyState title="Build your collection team" message="Create the first collector account below." icon="users"/>}</div></div>
   </div>
   <div className="team-forms"><form className="panel form-panel" onSubmit={handleCreateCollector}><div className="panel-heading"><span className="section-symbol"><Icon name="users"/></span><div><h2>Add a collector</h2><p>Give a crew member access to field operations.</p></div></div>
    <label htmlFor="col-name">Full name</label><input id="col-name" type="text" placeholder="e.g. Asha Kumar" value={collectorName} onChange={e=>setCollectorName(e.target.value)} required/>
    <label htmlFor="col-email">Email address</label><input id="col-email" type="email" placeholder="collector@example.com" value={collectorEmail} onChange={e=>setCollectorEmail(e.target.value)} required/>
    <label htmlFor="col-pw">Temporary password</label><input id="col-pw" type="password" placeholder="At least 6 characters" autoComplete="new-password" value={collectorPassword} onChange={e=>setCollectorPassword(e.target.value)} required minLength={6}/>
    <p className="field-help">Ask the collector to reset their password after signing in.</p><div className="form-footer"><button className="btn hi" disabled={collectorBusy}><Icon name="plus" size={17}/>{collectorBusy?'Creating…':'Add collector'}</button></div>{collectorMsg.t&&<p className={`msg ${collectorMsg.c}`} role="status">{collectorMsg.t}</p>}
   </form><div className="panel"><div className="panel-heading split"><div><h2>Workspace access</h2><p>Manage roles for residents, collectors, and administrators.</p></div><span className="count-pill">{people.length} people</span></div><div className="table-container"><div className="scroll"><table><thead><tr><th>Person</th><th>Points</th><th>Role</th></tr></thead><tbody>{people.map(p=><tr key={p.id}><td><b>{p.name||'Unnamed account'}</b><small>{p.email||'No email available'}</small></td><td>{p.points}</td><td><select aria-label={`Change role for ${p.name||p.id}`} value={p.role} onChange={e=>handleRoleChange(p.id,e.target.value as 'citizen'|'collector'|'admin')}><option value="citizen">Citizen</option><option value="collector">Collector</option><option value="admin">Admin</option></select></td></tr>)}</tbody></table>{!people.length&&<EmptyState title="No people loaded" message="Refresh to check your workspace accounts." icon="users"/>}</div></div></div></div>
  </div>}
  <dialog className="report-dialog" ref={dialog} onCancel={()=>setSelectedComplaint(null)} onClose={()=>setSelectedComplaint(null)} aria-labelledby="report-dialog-title">
   {selected&&<><div className="dialog-heading"><div><span className="eyebrow">REPORT #{selected.id.slice(0,8).toUpperCase()}</span><h2 id="report-dialog-title">{selected.category}</h2></div><button className="icon-button" aria-label="Close report details" onClick={()=>setSelectedComplaint(null)}><Icon name="close"/></button></div><p>{selected.description}</p><ReportBadges status={selected.status} priority={selected.priority} needsReview={selected.needs_review}/><p className="field-help">Reported {new Date(selected.created_at).toLocaleString()} · {selected.support} support</p>
    <ComplaintDetails key={selected.id} report={selected}/>
    <div className="dialog-controls"><form onSubmit={handleSetPriority}><label htmlFor="override-priority">Priority override</label><select id="override-priority" value={overridePriority} onChange={e=>setOverridePriority(e.target.value)}><option value="default">Default ({selected.base_priority})</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select><label htmlFor="override-reason">Reason</label><input id="override-reason" type="text" placeholder="Why is this priority changing?" value={overrideReason} onChange={e=>setOverrideReason(e.target.value)}/><button className="btn hi" disabled={overrideBusy}>{overrideBusy?'Saving…':'Save priority'}</button></form><div><label htmlFor="detail-crew">Assigned crew</label>{selected.status==='cleared'||selected.status==='rejected'?<p>{nameOf(selected.collector_id)} · Report closed</p>:<><select id="detail-crew" value={selected.collector_id||''} onChange={e=>assign(selected.id,e.target.value)}><option value="">Unassigned</option>{crews.map(c=><option key={c.id} value={c.id}>{c.name||c.email||'Crew member'}</option>)}</select><button className="btn ghost danger-button" onClick={()=>handleMarkFake(selected.id)}>Mark report as fake</button><p>Rejecting a report deducts 5 points from its reporter.</p></>}</div></div>
   </>}
  </dialog>
 </>;
}
