import {FormEvent,useEffect,useRef,useState} from 'react';
import {supabase} from '../lib/supabase';import {useAuth} from '../auth';import {useComplaints} from '../lib/useComplaints';
import {CATEGORIES,COLOR,LABEL} from '../lib/types';import MapView from '../MapView';
const cls={reported:'',assigned:'route',cleared:'done'};
export default function Citizen(){
 const {profile,refresh}=useAuth(),{rows,load}=useComplaints();
 const [cat,setCat]=useState(CATEGORIES[0]),[desc,setDesc]=useState(''),[file,setFile]=useState<File|null>(null);
 const [pick,setPick]=useState<[number,number]|null>(null),[msg,setMsg]=useState({t:'',c:''}),[busy,setBusy]=useState(false);
 const seen=useRef<Record<string,string>>({});
 useEffect(()=>{rows.forEach(r=>{const p=seen.current[r.id];
  if(p&&p!==r.status){setMsg({t:`Your ${r.category.toLowerCase()} report is now: ${LABEL[r.status]}.`,c:'good'});refresh()}
  seen.current[r.id]=r.status})},[rows]); // eslint-disable-line
 function locate(){navigator.geolocation?.getCurrentPosition(p=>setPick([p.coords.latitude,p.coords.longitude]),()=>setMsg({t:'Location is blocked. Tap the map to place the pin instead.',c:'err'}))}
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const form=e.currentTarget;
  if(!pick)return setMsg({t:'Tap the map or use your location to place the pin.',c:'err'});
  if(!desc.trim())return setMsg({t:'Add a short note so the crew knows what to look for.',c:'err'});
  setBusy(true);let image:string|null=null;
  if(file){const path=`${profile!.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g,'_')}`;
   const up=await supabase.storage.from('photos').upload(path,file);
   if(up.error){setBusy(false);return setMsg({t:'Photo upload failed: '+up.error.message,c:'err'})}
   image=supabase.storage.from('photos').getPublicUrl(path).data.publicUrl}
  const {data,error}=await supabase.rpc('submit_complaint',{p_category:cat,p_description:desc,p_lat:pick[0],p_lng:pick[1],p_image:image});
  setBusy(false);if(error)return setMsg({t:error.message,c:'err'});
  setMsg(data==='duplicate'?{t:'Already reported nearby. Your report was added to it (+2 points).',c:'good'}:{t:'Report sent. You earned 10 points.',c:'good'});
  form.reset();setDesc('');setFile(null);setPick(null);refresh();load()}
 return <div className="dash">
  <form className="panel" onSubmit={submit}><b>New report</b>
   <label htmlFor="c">What’s the problem?</label><select id="c" value={cat} onChange={e=>setCat(e.target.value)}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select>
   <label htmlFor="n">Short note</label><textarea id="n" value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Where exactly, and how bad?"/>
   <label htmlFor="p">Photo (optional)</label><input id="p" type="file" accept="image/*" onChange={e=>setFile(e.target.files?.[0]??null)}/>
   <p style={{margin:'12px 0 0',color:'var(--mute)',fontSize:'.92rem'}}>{pick?'Pin placed.':'Tap the map to place the pin.'}</p>
   <p className="msg" role="status" style={{color:msg.c==='err'?'var(--bad)':'var(--ok)'}}>{msg.t}</p>
   <button className="btn hi" disabled={busy}>{busy?'Sending…':'Send report'}</button>
   <button type="button" className="btn ghost" onClick={locate}>Use my location</button></form>
  <div><MapView height={320} pick={pick} onPick={(a,b)=>setPick([a,b])} points={rows.map(r=>({id:r.id,lat:r.lat,lng:r.lng,color:COLOR[r.status],label:`${r.category}: ${LABEL[r.status]}`}))}/>
   <h2 className="mt" style={{fontSize:'1.3rem'}}>Your reports</h2>
   <ul className="list">{rows.length===0&&<li className="item">No reports yet. Place a pin to send your first.</li>}
    {rows.map(r=><li className="item" key={r.id}><div>{r.category}<small>{r.description}{r.upvotes>1?` (${r.upvotes} residents)`:''}</small>
     {r.status==='cleared'&&r.resolution_note&&<small>Crew note: {r.resolution_note}</small>}</div><span className={'badge '+cls[r.status]}>{LABEL[r.status]}</span></li>)}</ul></div></div>}
