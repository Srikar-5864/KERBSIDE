import {FormEvent,useCallback,useEffect,useState} from 'react';
import {supabase,createIsolatedClient} from '../lib/supabase';import {useComplaints} from '../lib/useComplaints';
import {CATEGORIES,COLOR,LABEL,Profile} from '../lib/types';import MapView from '../MapView';
interface Bin{id:string;lat:number;lng:number;fill:number}
export default function Admin(){
 const {rows,load}=useComplaints();const [people,setPeople]=useState<Profile[]>([]),[bins,setBins]=useState<Bin[]>([]),[msg,setMsg]=useState('');
 const [collectorName,setCollectorName]=useState('');
 const [collectorEmail,setCollectorEmail]=useState('');
 const [collectorPassword,setCollectorPassword]=useState('');
 const [collectorBusy,setCollectorBusy]=useState(false);
 const [collectorMsg,setCollectorMsg]=useState({t:'',c:''});
 const fetchAll=useCallback(async()=>{const a=await supabase.from('profiles').select('*'),b=await supabase.from('bins').select('*');setPeople((a.data??[]) as Profile[]);setBins((b.data??[]) as Bin[])},[]);
 useEffect(()=>{fetchAll()},[fetchAll]);
 const crews=people.filter(p=>p.role==='collector'),name=(id:string|null)=>people.find(p=>p.id===id)?.name||'Unassigned';
 const open=rows.filter(r=>r.status!=='cleared'),done=rows.length-open.length;
 async function assign(id:string,cid:string){await supabase.from('complaints').update({collector_id:cid||null,status:cid?'assigned':'reported'}).eq('id',id);load()}
 async function auto(){
  if(!crews.length)return setMsg('No collectors yet. Set a user’s role to collector in the profiles table.');
  const loadOf:Record<string,number>={};crews.forEach(c=>{loadOf[c.id]=rows.filter(r=>r.collector_id===c.id&&r.status==='assigned').length});
  const todo=rows.filter(r=>r.status==='reported');
  for(const r of todo){const best=crews.reduce((a,b)=>loadOf[a.id]<=loadOf[b.id]?a:b);loadOf[best.id]++;await supabase.from('complaints').update({collector_id:best.id,status:'assigned'}).eq('id',r.id)}
  setMsg(todo.length?`Assigned ${todo.length} report(s) by workload.`:'Nothing to assign.');load()}
 function exportCsv(){
  const esc=(v:unknown)=>'"'+String(v??'').replace(/"/g,'""')+'"';
  const csv=['id,category,description,status,crew,lat,lng,residents,created'].concat(rows.map(r=>[r.id,r.category,r.description,LABEL[r.status],name(r.collector_id),r.lat,r.lng,r.upvotes,r.created_at].map(esc).join(','))).join('\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='kerbside-report.csv';a.click()}
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
    await supabase.from('profiles').update({role:'collector',name:collectorName}).eq('id',data.user.id);
   }
   setCollectorMsg({t:`Collector account created for ${collectorEmail}! They can now sign in.`,c:'good'});
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
 return <div style={{paddingBottom:48}}>
  <div className="stats"><div className="stat"><b>{open.length}</b>Open</div><div className="stat"><b>{rows.length?Math.round(100*done/rows.length):0}%</b>Cleared</div><div className="stat"><b>{bins.filter(b=>b.fill>80).length}</b>Bins over 80%</div></div>
  <div className="dash" style={{paddingBottom:0}}>
   <MapView height={400} points={[...bins.map(b=>({id:b.id,lat:b.lat,lng:b.lng,color:b.fill>80?'#c8402f':'#f2c230',label:`Bin ${b.fill}% full`,small:true})),...rows.map(r=>({id:r.id,lat:r.lat,lng:r.lng,color:COLOR[r.status],label:`${r.category}: ${LABEL[r.status]}`}))]}/>
   <div className="panel"><b>Hotspots by category</b><div style={{marginTop:8}}>{CATEGORIES.map(c=>{const n=rows.filter(r=>r.category===c).length;return <div className="bar" key={c}><span>{c}</span><div style={{width:(rows.length?n/rows.length*100:0)+'%'}}/><b>{n}</b></div>})}</div>
    <b className="mt" style={{display:'block'}}>Crew performance</b>
    <ul className="list" style={{marginTop:8}}>{crews.length===0&&<li className="item">No collectors yet.</li>}{crews.map(c=><li className="item" key={c.id}><span>{c.name||'Crew member'}</span><small>{rows.filter(r=>r.collector_id===c.id&&r.status==='cleared').length} cleared, {rows.filter(r=>r.collector_id===c.id&&r.status==='assigned').length} open</small></li>)}</ul></div></div>

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
     <thead><tr><th>Name</th><th>Role</th><th>Points</th><th>Change Access</th></tr></thead>
     <tbody>
      {people.map(p=><tr key={p.id}>
       <td>{p.name||'(No name)'}</td>
       <td><span className={`badge ${p.role==='collector'?'route':p.role==='admin'?'done':''}`}>{p.role}</span></td>
       <td>{p.points}</td>
       <td>
        <select aria-label={`Change role for ${p.name||p.id}`} value={p.role} onChange={e=>handleRoleChange(p.id,e.target.value as any)} style={{width:'auto',padding:'4px 8px',margin:0}}>
         <option value="citizen">Citizen</option>
         <option value="collector">Collector</option>
         <option value="admin">Admin</option>
        </select>
       </td>
      </tr>)}
      {people.length===0&&<tr><td colSpan={4}>No users found.</td></tr>}
     </tbody>
    </table>
   </div>
  </div>

  <div className="panel mt"><div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}><b style={{marginRight:'auto'}}>All complaints</b>
   <button className="btn hi" onClick={auto}>Auto-assign by workload</button><button className="btn ghost" style={{margin:0}} onClick={exportCsv}>Export CSV</button></div>
   <p className="msg" role="status">{msg}</p>
   <div className="scroll"><table><thead><tr><th>Category</th><th>Note</th><th>Status</th><th>Crew</th></tr></thead><tbody>
    {rows.map(r=><tr key={r.id}><td>{r.category}</td><td>{r.description}</td><td>{LABEL[r.status]}</td><td>{r.status==='cleared'?name(r.collector_id):
     <select aria-label="Assign crew" value={r.collector_id??''} onChange={e=>assign(r.id,e.target.value)}><option value="">Unassigned</option>{crews.map(c=><option key={c.id} value={c.id}>{c.name||c.id.slice(0,6)}</option>)}</select>}</td></tr>)}
    {rows.length===0&&<tr><td colSpan={4}>No complaints yet.</td></tr>}</tbody></table></div></div></div>}
