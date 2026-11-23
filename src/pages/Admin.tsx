import {FormEvent,useCallback,useEffect,useMemo,useState} from 'react';
import {supabase,createIsolatedClient} from '../lib/supabase';
import {useComplaints} from '../lib/useComplaints';
import {CATEGORIES,COLOR,LABEL,Priority,Profile,Complaint} from '../lib/types';
import MapView,{Pt} from '../MapView';
import {StatusBadge,PriorityBadge,ReportBadges} from '../components/Badges';

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

export default function Admin(){
 const {rows,load}=useComplaints();
 const [people,setPeople]=useState<Profile[]>([]);
 const [bins,setBins]=useState<Bin[]>([]);
 const [msg,setMsg]=useState('');

 // Filters
 const [statusFilter,setStatusFilter]=useState<string>('all');
 const [categoryFilter,setCategoryFilter]=useState<string>('all');
 const [selectedComplaint,setSelectedComplaint]=useState<Complaint|null>(null);

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
  await supabase.from('complaints').update({collector_id:cid||null,status:cid?'assigned':'reported'}).eq('id',id);
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
  a.click();
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
    await supabase.from('profiles').update({role:'collector',name:collectorName,email:collectorEmail}).eq('id',data.user.id);
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
   onClick:()=>{
    setSelectedComplaint(r);
    setOverridePriority(r.priority_override||r.priority||'');
    setOverrideReason(r.override_reason||'');
   }
  }))
 ];

 return (
  <div style={{paddingBottom:48}}>
   {/* 1. TOP STAT CARDS */}
   <div className="stats" style={{gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:12}}>
    <div className="stat" style={{border:unassignedRows.length>0?'2px solid var(--bad)':'2px solid var(--line)'}}>
     <b style={{color:unassignedRows.length>0?'var(--bad)':'inherit'}}>{unassignedRows.length}</b>
     <span style={{fontWeight:700}}>Unassigned</span>
     <small style={{display:'block',color:'var(--mute)',marginTop:2}}>
      {unassignedRows.length>0?'Awaiting crew dispatch':'All reports assigned'}
     </small>
    </div>

    <div className="stat" style={{border:overdueRows.length>0?'2px solid var(--bad)':'2px solid var(--line)'}}>
     <b style={{color:overdueRows.length>0?'var(--bad)':'inherit'}}>{overdueRows.length}</b>
     <span style={{fontWeight:700}}>Overdue</span>
     <small style={{display:'block',color:'var(--mute)',marginTop:2}}>
      {overdueRows.length>0?'Exceeded resolution target time':'No overdue jobs.'}
     </small>
    </div>

    <div className="stat">
     <b>{openRows.length} <small style={{fontSize:'1.1rem',color:'var(--mute)',fontWeight:500}}>of {rows.length} total</small></b>
     <span style={{fontWeight:700}}>Open now</span>
     <small style={{display:'block',color:'var(--mute)',marginTop:2}}>Currently in progress</small>
    </div>

    <div className="stat">
     <b>{clearedThisWeek.length}</b>
     <span style={{fontWeight:700}}>Cleared this week</span>
     <small style={{display:'block',color:'var(--mute)',marginTop:2}}>Resolved past 7 days</small>
    </div>
   </div>

   {/* 2. OLDEST OPEN COMPLAINTS */}
   <div className="panel mt">
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8,marginBottom:8}}>
     <div>
      <b style={{fontSize:'1.1rem'}}>Oldest open complaints</b>
      <p style={{margin:'2px 0 0',color:'var(--mute)',fontSize:'.88rem'}}>Top 5 oldest unresolved issues requiring attention.</p>
     </div>
    </div>

    {oldestOpen.length===0?(
     <p style={{color:'var(--mute)',margin:'12px 0'}}>No open reports right now.</p>
    ):(
     <div className="scroll">
      <table>
       <thead>
        <tr>
         <th>Thumbnail</th>
         <th>Category & Note</th>
         <th>Age / Target</th>
         <th>Priority</th>
         <th>Assign Crew</th>
         <th>Action</th>
        </tr>
       </thead>
       <tbody>
        {oldestOpen.map(r=>(
         <tr key={r.id}>
          <td style={{width:60}}>
           {r.image_url?(
            <img src={r.image_url} alt="" style={{width:44,height:44,objectFit:'cover',borderRadius:6}}/>
           ):(
            <div style={{width:44,height:44,background:'var(--bg)',borderRadius:6,display:'grid',placeItems:'center',color:'var(--mute)',fontSize:'.75rem'}}>No img</div>
           )}
          </td>
          <td>
           <b>{r.category}</b>
           <small style={{display:'block',color:'var(--mute)'}}>{r.description}</small>
          </td>
          <td>
           <span>{timeAgo(r.created_at)}</span>
           <small style={{display:'block',color:'var(--route)',fontWeight:600}}>{targetClearText(r.due_at)}</small>
          </td>
          <td>
           <PriorityBadge priority={r.priority} />
          </td>
          <td>
           <select
            aria-label="Assign crew"
            value={r.collector_id??''}
            onChange={e=>assign(r.id,e.target.value)}
            style={{padding:'4px 8px'}}
           >
            <option value="">Unassigned</option>
            {crews.map(c=><option key={c.id} value={c.id}>{c.name||c.email||c.id.slice(0,6)}</option>)}
           </select>
          </td>
          <td>
           <button
            className="btn ghost"
            style={{padding:'4px 10px',fontSize:'.82rem',color:'var(--bad)',borderColor:'var(--bad)'}}
            onClick={()=>handleMarkFake(r.id)}
           >
            Mark fake
           </button>
          </td>
         </tr>
        ))}
       </tbody>
      </table>
     </div>
    )}
   </div>

   {/* 3. MAP WITH FILTERS, LEGEND, AND DETAIL CARD */}
   <div className="panel mt">
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8,marginBottom:12}}>
     <b>City Map & Infrastructure</b>
     {/* Filter chips */}
     <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
      <label style={{margin:0,fontSize:'.85rem'}}>Status:</label>
      <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} style={{width:'auto',padding:'4px 8px'}}>
       <option value="all">All statuses</option>
       <option value="reported">Reported</option>
       <option value="assigned">Assigned</option>
       <option value="cleared">Cleared</option>
       <option value="rejected">Rejected (fake)</option>
      </select>

      <label style={{margin:0,fontSize:'.85rem',marginLeft:8}}>Category:</label>
      <select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)} style={{width:'auto',padding:'4px 8px'}}>
       <option value="all">All categories</option>
       {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
      </select>
     </div>
    </div>

    <MapView height={420} points={mapPoints}/>

    {/* Map Legend */}
    <div style={{display:'flex',gap:16,flexWrap:'wrap',alignItems:'center',padding:'10px 4px 0',fontSize:'.85rem',color:'var(--mute)'}}>
     <span style={{display:'flex',alignItems:'center',gap:4}}>
      <b style={{display:'inline-block',width:10,height:10,borderRadius:'50%',background:'#c8402f'}}/> Reported
     </span>
     <span style={{display:'flex',alignItems:'center',gap:4}}>
      <b style={{display:'inline-block',width:10,height:10,borderRadius:'50%',background:'#2b6cff'}}/> Assigned
     </span>
     <span style={{display:'flex',alignItems:'center',gap:4}}>
      <b style={{display:'inline-block',width:10,height:10,borderRadius:'50%',background:'#2f7d57'}}/> Cleared
     </span>
     <span style={{display:'flex',alignItems:'center',gap:4}}>
      <b style={{display:'inline-block',width:10,height:10,borderRadius:'50%',background:'#8892a0'}}/> Rejected / Fake
     </span>
     <span style={{display:'flex',alignItems:'center',gap:4}}>
      <b style={{display:'inline-block',width:10,height:10,background:'#f2c230',border:'1px solid #fff'}}/> Bin
     </span>
     <span style={{display:'flex',alignItems:'center',gap:4}}>
      <b style={{display:'inline-block',width:10,height:10,background:'#c8402f',border:'1px solid #fff'}}/> Bin (&gt;80%)
     </span>
     <span style={{display:'flex',alignItems:'center',gap:4}}>
      <b style={{display:'inline-block',width:12,height:12,borderRadius:'50%',border:'3px solid #14233a',background:'transparent'}}/> Active Crew
     </span>
     <span style={{display:'flex',alignItems:'center',gap:4}}>
      <b style={{display:'inline-block',width:12,height:12,borderRadius:'50%',border:'3px solid #8892a0',background:'transparent'}}/> Inactive Crew (&gt;30m)
     </span>
     <span style={{display:'flex',alignItems:'center',gap:4}}>
      <b style={{display:'inline-flex',width:14,height:14,borderRadius:'50%',background:'#c8402f',color:'#fff',fontSize:10,fontWeight:900,alignItems:'center',justifyContent:'center',border:'1.5px solid #fff',lineHeight:1}}>!</b> High Priority
     </span>
    </div>

    {/* Selected Complaint Detail Card */}
    {selectedComplaint&&(
     <div className="panel mt" style={{background:'var(--bg)',border:'2px solid var(--route)',position:'relative'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12}}>
       <div>
        <h3 style={{margin:'0 0 4px',fontSize:'1.2rem'}}>{selectedComplaint.category}</h3>
        <p style={{margin:'0 0 8px'}}>{selectedComplaint.description}</p>
        <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',fontSize:'.88rem'}}>
         <ReportBadges status={selectedComplaint.status} priority={selectedComplaint.priority} needsReview={selectedComplaint.needs_review} />
         <span style={{color:'var(--mute)'}}>{timeAgo(selectedComplaint.created_at)}</span>
         <span style={{color:'var(--route)',fontWeight:600}}>{targetClearText(selectedComplaint.due_at)}</span>
        </div>
        {selectedComplaint.override_reason&&(
         <p style={{fontSize:'.84rem',color:'var(--mute)',margin:'6px 0 0'}}>
          Override reason: <i>{selectedComplaint.override_reason}</i>
         </p>
        )}
       </div>

       {selectedComplaint.image_url&&(
        <img src={selectedComplaint.image_url} alt="" style={{width:90,height:90,objectFit:'cover',borderRadius:8}}/>
       )}
      </div>

      {/* Priority Override & Action controls */}
      <div style={{marginTop:14,borderTop:'1px solid var(--line)',paddingTop:12,display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12,alignItems:'end'}}>
       <form onSubmit={handleSetPriority} style={{display:'contents'}}>
        <div>
         <label style={{margin:'0 0 4px',fontSize:'.82rem'}}>Override Priority</label>
         <select value={overridePriority} onChange={e=>setOverridePriority(e.target.value)} style={{padding:'6px'}}>
          <option value="default">Default ({selectedComplaint.base_priority})</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
         </select>
        </div>
        <div>
         <label style={{margin:'0 0 4px',fontSize:'.82rem'}}>Reason</label>
         <input type="text" placeholder="Reason for override" value={overrideReason} onChange={e=>setOverrideReason(e.target.value)}/>
        </div>
        <div>
         <button className="btn hi" style={{padding:'7px 14px',fontSize:'.88rem'}} disabled={overrideBusy}>
          Save Priority
         </button>
        </div>
       </form>

       <div style={{display:'flex',gap:8,alignItems:'center'}}>
        <div style={{flex:1}}>
         <label style={{margin:'0 0 4px',fontSize:'.82rem'}}>Assign Crew</label>
         <select
          value={selectedComplaint.collector_id??''}
          onChange={e=>assign(selectedComplaint.id,e.target.value)}
          style={{padding:'6px'}}
         >
          <option value="">Unassigned</option>
          {crews.map(c=><option key={c.id} value={c.id}>{c.name||c.email||c.id.slice(0,6)}</option>)}
         </select>
        </div>
        <button
         className="btn ghost"
         style={{padding:'7px 12px',fontSize:'.88rem',color:'var(--bad)',borderColor:'var(--bad)',marginTop:18}}
         onClick={()=>handleMarkFake(selectedComplaint.id)}
        >
         Mark fake
        </button>
        <button
         className="btn ghost"
         style={{padding:'7px 12px',fontSize:'.88rem',marginTop:18}}
         onClick={()=>setSelectedComplaint(null)}
        >
         Close
        </button>
       </div>
      </div>
     </div>
    )}
   </div>

   {/* 4. 7-DAY BAR CHART & CATEGORY SHARE */}
   <div className="dash mt">
    {/* Plain SVG Bar Chart */}
    <div className="panel">
     <b>Complaints Past 7 Days</b>
     <p style={{margin:'2px 0 12px',color:'var(--mute)',fontSize:'.88rem'}}>Volume of incoming reports per day.</p>

     <div style={{width:'100%',overflowX:'auto'}}>
      <svg viewBox="0 0 350 160" style={{width:'100%',maxWidth:420,height:'auto',display:'block'}}>
       {/* Grid lines */}
       <line x1="30" y1="20" x2="330" y2="20" stroke="var(--line)" strokeDasharray="3 3"/>
       <line x1="30" y1="70" x2="330" y2="70" stroke="var(--line)" strokeDasharray="3 3"/>
       <line x1="30" y1="120" x2="330" y2="120" stroke="var(--line)"/>

       {dailyStats.days.map((d,idx)=>{
        const x=45+idx*40;
        const barH=(d.count/dailyStats.max)*90;
        const y=120-barH;
        return (
         <g key={d.dateStr}>
          <rect x={x} y={y} width="24" height={barH} fill="var(--hi)" rx="4"/>
          {d.count>0&&(
           <text x={x+12} y={Math.max(16,y-4)} textAnchor="middle" fill="var(--ink)" fontSize="11" fontWeight="700">
            {d.count}
           </text>
          )}
          <text x={x+12} y="138" textAnchor="middle" fill="var(--mute)" fontSize="10">
           {d.dayName.split(' ')[0]}
          </text>
         </g>
        );
       })}
      </svg>
     </div>
    </div>

    {/* Category Share Percentages */}
    <div className="panel">
     <b>Category Share</b>
     <p style={{margin:'2px 0 12px',color:'var(--mute)',fontSize:'.88rem'}}>Percentage breakdown of total reports.</p>

     {categoryShares.length===0?(
      <p style={{color:'var(--mute)',margin:'16px 0'}}>No complaints on record.</p>
     ):(
      <div>
       {categoryShares.map(item=>(
        <div className="bar" key={item.category} style={{gridTemplateColumns:'150px 1fr 45px'}}>
         <span style={{fontSize:'.88rem',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{item.category}</span>
         <div style={{width:`${item.pct}%`}}/>
         <b style={{fontSize:'.85rem'}}>{item.pct}%</b>
        </div>
       ))}
      </div>
     )}
    </div>
   </div>

   {/* 5. CREW WORKLOAD & LAST SEEN TABLE */}
   <div className="panel mt">
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8,marginBottom:12}}>
     <div>
      <b style={{fontSize:'1.1rem'}}>Crew performance & Workload</b>
      <p style={{margin:'2px 0 0',color:'var(--mute)',fontSize:'.88rem'}}>Live crew status, resolution speeds, and location tracking.</p>
     </div>
     <button className="btn ghost" style={{padding:'6px 12px',fontSize:'.85rem'}} onClick={fetchAll}>Refresh crews</button>
    </div>

    <div className="scroll">
     <table>
      <thead>
       <tr>
        <th>Crew Member</th>
        <th>Open Jobs</th>
        <th>Cleared This Week</th>
        <th>Avg Clear Time</th>
        <th>Workload</th>
        <th>Location</th>
       </tr>
      </thead>
      <tbody>
       {crews.map(c=>{
        const assignedJobs=rows.filter(r=>r.collector_id===c.id&&r.status==='assigned');
        const clearedWeekJobs=rows.filter(r=>r.collector_id===c.id&&r.status==='cleared'&&r.cleared_at&&new Date(r.cleared_at).getTime()>=oneWeekAgo);
        const allClearedWithTime=rows.filter(r=>r.collector_id===c.id&&r.status==='cleared'&&r.cleared_at);
        const avgMs=allClearedWithTime.length>0
         ?allClearedWithTime.reduce((acc,r)=>acc+(new Date(r.cleared_at!).getTime()-new Date(r.created_at).getTime()),0)/allClearedWithTime.length
         :0;
        const totalOpen=openRows.length||1;
        const workloadPct=Math.min(100,Math.round((assignedJobs.length/totalOpen)*100));

        const lastSeenText=c.location_at
         ?`${Math.floor((Date.now()-new Date(c.location_at).getTime())/60000)} min ago`
         :'Never';

        return (
         <tr key={c.id}>
          <td>
           <b>{c.name||'Crew member'}</b>
           {c.email&&<small style={{display:'block',color:'var(--mute)'}}>{c.email}</small>}
          </td>
          <td><b>{assignedJobs.length}</b> open</td>
          <td>{clearedWeekJobs.length}</td>
          <td>{allClearedWithTime.length>0?formatDuration(avgMs):'N/A'}</td>
          <td style={{minWidth:120}}>
           <div style={{display:'flex',alignItems:'center',gap:8}}>
            <div style={{flex:1,height:8,background:'var(--line)',borderRadius:4,overflow:'hidden'}}>
             <div style={{width:`${workloadPct}%`,height:'100%',background:'var(--route)'}}/>
            </div>
            <small style={{fontSize:'.75rem'}}>{assignedJobs.length}</small>
           </div>
          </td>
          <td>
           <small style={{color:'var(--mute)'}}>
            Location: last seen {lastSeenText}
           </small>
          </td>
         </tr>
        );
       })}
       {crews.length===0&&<tr><td colSpan={6}>No collectors yet. Add one below.</td></tr>}
      </tbody>
     </table>
    </div>
   </div>

   {/* 6. CREATE COLLECTOR ACCOUNT */}
   <div className="panel mt">
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
     <div>
      <b style={{fontSize:'1.1rem'}}>Create Collector Account</b>
      <p style={{margin:'2px 0 0',color:'var(--mute)',fontSize:'.88rem'}}>Directly register a new crew member without modifying database tables.</p>
     </div>
    </div>
    <form onSubmit={handleCreateCollector} style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,alignItems:'end',marginTop:12}}>
     <div>
      <label htmlFor="col-name" style={{margin:'0 0 4px',fontSize:'.85rem'}}>Full Name</label>
      <input id="col-name" type="text" placeholder="e.g. Maya Lin" value={collectorName} onChange={e=>setCollectorName(e.target.value)} required/>
     </div>
     <div>
      <label htmlFor="col-email" style={{margin:'0 0 4px',fontSize:'.85rem'}}>Email</label>
      <input id="col-email" type="email" placeholder="collector@kerbside.com" value={collectorEmail} onChange={e=>setCollectorEmail(e.target.value)} required/>
     </div>
     <div>
      <label htmlFor="col-pw" style={{margin:'0 0 4px',fontSize:'.85rem'}}>Password</label>
      <input id="col-pw" type="password" placeholder="Min 6 characters" value={collectorPassword} onChange={e=>setCollectorPassword(e.target.value)} required/>
     </div>
     <div>
      <button className="btn hi" style={{width:'100%',padding:'11px'}} disabled={collectorBusy}>{collectorBusy?'Creating…':'Add Collector'}</button>
     </div>
    </form>
    {collectorMsg.t&&<p className={`msg ${collectorMsg.c}`} role="status" style={{marginTop:8}}>{collectorMsg.t}</p>}
   </div>

   {/* 7. ALL COMPLAINTS TABLE & AUTO ASSIGN */}
   <div className="panel mt">
    <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
     <b style={{marginRight:'auto',fontSize:'1.1rem'}}>All complaints ({rows.length})</b>
     <button className="btn hi" onClick={handleAutoAssign}>Auto-assign by nearest crew</button>
     <button className="btn ghost" style={{margin:0}} onClick={exportCsv}>Export CSV</button>
    </div>
    {msg&&<p className="msg" role="status">{msg}</p>}

    <div className="scroll">
     <table>
      <thead>
       <tr>
        <th>Category</th>
        <th>Note</th>
        <th>Priority</th>
        <th>Target / Due</th>
        <th>Status</th>
        <th>Crew</th>
       </tr>
      </thead>
      <tbody>
       {rows.map(r=>(
        <tr key={r.id}>
         <td>
          <b>{r.category}</b>
          <small style={{display:'block',color:'var(--mute)'}}>{r.support} support ({r.voters} votes)</small>
         </td>
         <td>{r.description}</td>
         <td>
          <PriorityBadge priority={r.priority} needsReview={r.needs_review} />
         </td>
         <td>
          <small style={{color:'var(--route)',fontWeight:600}}>{targetClearText(r.due_at)}</small>
         </td>
         <td>
          <StatusBadge status={r.status} />
         </td>
         <td>
          {r.status==='cleared'?nameOf(r.collector_id):(
           <select aria-label="Assign crew" value={r.collector_id??''} onChange={e=>assign(r.id,e.target.value)}>
            <option value="">Unassigned</option>
            {crews.map(c=><option key={c.id} value={c.id}>{c.name||c.email||c.id.slice(0,6)}</option>)}
           </select>
          )}
         </td>
        </tr>
       ))}
       {rows.length===0&&<tr><td colSpan={6}>No complaints yet.</td></tr>}
      </tbody>
     </table>
    </div>
   </div>

   {/* 8. USER ROLES */}
   <div className="panel mt">
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
     <div>
      <b style={{fontSize:'1.1rem'}}>User Roles ({people.length})</b>
      <p style={{margin:'2px 0 0',color:'var(--mute)',fontSize:'.88rem'}}>Promote or change user roles instantly.</p>
     </div>
     <button className="btn ghost" style={{margin:0,padding:'6px 12px',fontSize:'.85rem'}} onClick={fetchAll}>Refresh</button>
    </div>
    <div className="scroll">
     <table>
      <thead>
       <tr>
        <th>Name</th>
        <th>Email</th>
        <th>Role</th>
        <th>Points</th>
        <th>Change Access</th>
       </tr>
      </thead>
      <tbody>
       {people.map(p=>(
        <tr key={p.id}>
         <td>{p.name||'(No name)'}</td>
         <td><small style={{color:'var(--mute)'}}>{p.email||'N/A'}</small></td>
         <td><span className={`badge ${p.role==='collector'?'route':p.role==='admin'?'done':''}`}>{p.role}</span></td>
         <td>{p.points}</td>
         <td>
          <select aria-label={`Change role for ${p.name||p.id}`} value={p.role} onChange={e=>handleRoleChange(p.id,e.target.value as any)} style={{width:'auto',padding:'4px 8px',margin:0}}>
           <option value="citizen">Citizen</option>
           <option value="collector">Collector</option>
           <option value="admin">Admin</option>
          </select>
         </td>
        </tr>
       ))}
       {people.length===0&&<tr><td colSpan={5}>No users found.</td></tr>}
      </tbody>
     </table>
    </div>
   </div>
  </div>
 );
}
