import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';import {useAuth} from '../auth';import {useComplaints} from '../lib/useComplaints';
import {Complaint,DEPOT} from '../lib/types';import {orderRoute} from '../lib/route';import MapView from '../MapView';
function Job({r,n,done}:{r:Complaint;n:number;done:()=>void}){
 const [note,setNote]=useState(''),[file,setFile]=useState<File|null>(null),[err,setErr]=useState(''),[busy,setBusy]=useState(false);
 async function clear(){
  if(!note.trim())return setErr('Add a resolution remark first.');
  setBusy(true);let url:string|null=null;
  if(file){const path=`done/${r.id}-${file.name.replace(/[^\w.-]/g,'_')}`;const up=await supabase.storage.from('photos').upload(path,file,{upsert:true});
   if(up.error){setBusy(false);return setErr(up.error.message)}url=supabase.storage.from('photos').getPublicUrl(path).data.publicUrl}
  const {error}=await supabase.from('complaints').update({status:'cleared',resolution_note:note.trim(),done_image_url:url}).eq('id',r.id);
  setBusy(false);if(error)return setErr(error.message);done()}
 return <li className="item job"><div><b>{n}. {r.category}</b><small>{r.description}</small></div>
  {r.image_url&&<img src={r.image_url} alt="Reported waste" loading="lazy"/>}
  <input type="text" aria-label="Resolution remark" placeholder="Resolution remark" value={note} onChange={e=>setNote(e.target.value)}/>
  <input type="file" accept="image/*" aria-label="Completion photo" onChange={e=>setFile(e.target.files?.[0]??null)}/>
  {err&&<p className="msg err">{err}</p>}<button className="btn" disabled={busy} onClick={clear}>Mark cleared</button></li>}
export default function Crew(){
 const {profile}=useAuth(),{rows,load}=useComplaints();const [start,setStart]=useState<[number,number]>(DEPOT);
 useEffect(()=>{navigator.geolocation?.getCurrentPosition(p=>setStart([p.coords.latitude,p.coords.longitude]))},[]);
 const mine=orderRoute(start,rows.filter(r=>r.collector_id===profile?.id&&r.status==='assigned'));
 const path:[number,number][]=[start,...mine.map(r=>[r.lat,r.lng] as [number,number])];
 return <div className="dash"><div><h2 style={{fontSize:'1.4rem'}}>Today’s jobs</h2>
  <p className="sub" style={{marginBottom:12}}>Ordered by the shortest path from your location.</p>
  <ul className="list">{mine.length===0&&<li className="item">No open jobs. New assignments appear here live.</li>}
   {mine.map((r,i)=><Job key={r.id} r={r} n={i+1} done={load}/>)}</ul></div>
  <MapView height={460} route={path} points={mine.map((r,i)=>({id:r.id,lat:r.lat,lng:r.lng,color:'#2b6cff',label:`${i+1}. ${r.category}`}))}/></div>}
