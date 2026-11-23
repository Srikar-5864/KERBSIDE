import {FormEvent,useEffect,useRef,useState} from 'react';
import {supabase} from '../lib/supabase';import {useAuth} from '../auth';import {useComplaints} from '../lib/useComplaints';
import {CATEGORIES,COLOR,LABEL} from '../lib/types';import MapView from '../MapView';
import FilePicker from '../components/FilePicker';
import {ReportBadges} from '../components/Badges';
import Community from './Community';

function targetClearText(dueAt:string|null|undefined):string{
 if(!dueAt)return '';
 const diff=Math.round((new Date(dueAt).getTime()-Date.now())/3600000);
 if(diff>0)return `Target: clear within ${diff} h`;
 if(diff===0)return 'Target: clear within <1 h';
 return `Target: overdue by ${Math.abs(diff)} h`;
}

export default function Citizen(){
 const {profile,refresh}=useAuth(),{rows,load}=useComplaints();
 const [tab,setTab]=useState<'mine'|'community'>('mine');
 const [cat,setCat]=useState(CATEGORIES[0]),[desc,setDesc]=useState(''),[file,setFile]=useState<File|null>(null);
 const [pick,setPick]=useState<[number,number]|null>(null),[msg,setMsg]=useState({t:'',c:''}),[busy,setBusy]=useState(false);
 const [duplicateId,setDuplicateId]=useState<string|null>(null);
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
  navigator.geolocation?.getCurrentPosition(
   p=>setPick([p.coords.latitude,p.coords.longitude]),
   ()=>setMsg({t:'Location is blocked. Tap the map to place the pin instead.',c:'err'})
  );
 }

 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  const form=e.currentTarget;
  if(!pick)return setMsg({t:'Tap the map or use your location to place the pin.',c:'err'});
  if(!desc.trim())return setMsg({t:'Add a short note so the crew knows what to look for.',c:'err'});

  setBusy(true);
  setDuplicateId(null);
  let image:string|null=null;
  if(file){
   const path=`${profile!.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g,'_')}`;
   const up=await supabase.storage.from('photos').upload(path,file);
   if(up.error){
    setBusy(false);
    return setMsg({t:'Photo upload failed: '+up.error.message,c:'err'});
   }
   image=supabase.storage.from('photos').getPublicUrl(path).data.publicUrl;
  }

  const {data,error}=await supabase.rpc('submit_complaint',{
   p_category:cat,
   p_description:desc,
   p_lat:pick[0],
   p_lng:pick[1],
   p_image:image
  });
  setBusy(false);
  if(error)return setMsg({t:error.message,c:'err'});

  if(data?.result==='duplicate'){
   setDuplicateId(data.id);
   setMsg({t:'This is already reported nearby.',c:'err'});
  }else{
   setMsg({t:'Report sent. You earned 2 points.',c:'good'});
   form.reset();
   setDesc('');
   setFile(null);
   setPick(null);
   refresh();
   load();
  }
 }

 async function supportDuplicate(){
  if(!duplicateId||!pick)return;
  setBusy(true);
  const {data,error}=await supabase.rpc('cast_vote',{
   p_complaint:duplicateId,
   p_lat:pick[0],
   p_lng:pick[1]
  });
  setBusy(false);
  if(error){
   setMsg({t:error.message,c:'err'});
  }else{
   setMsg({t:'Supported existing report nearby!',c:'good'});
   setDuplicateId(null);
   setDesc('');
   setFile(null);
   setPick(null);
   refresh();
   load();
  }
 }

 return (
  <div>
   <div className="tabs" role="tablist" aria-label="Resident tabs" style={{marginBottom:20}}>
    <button
     role="tab"
     id="tab-mine"
     aria-selected={tab==='mine'}
     aria-controls="panel-mine"
     onClick={()=>{setTab('mine');setDuplicateId(null);}}
    >
     My reports
    </button>
    <button
     role="tab"
     id="tab-community"
     aria-selected={tab==='community'}
     aria-controls="panel-community"
     onClick={()=>{setTab('community');setDuplicateId(null);}}
    >
     Community
    </button>
   </div>

   {tab==='community'?(
    <div id="panel-community" role="tabpanel" aria-labelledby="tab-community">
     <Community/>
    </div>
   ):(
    <div id="panel-mine" role="tabpanel" aria-labelledby="tab-mine" className="dash">
     <form className="panel" onSubmit={submit}>
      <b>New report</b>
      <label htmlFor="c">What’s the problem?</label>
      <select id="c" value={cat} onChange={e=>setCat(e.target.value)}>
       {CATEGORIES.map(c=><option key={c}>{c}</option>)}
      </select>

      <label htmlFor="n">Short note</label>
      <textarea id="n" value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Where exactly, and how bad?"/>

      {/* REUSABLE FILE PICKER */}
      <FilePicker
       label="Photo (optional)"
       file={file}
       onChange={setFile}
       id="citizen-photo-picker"
      />

      <p style={{margin:'12px 0 0',color:'var(--mute)',fontSize:'.92rem'}}>{pick?'Pin placed.':'Tap the map to place the pin.'}</p>
      <p className="msg" role="status" style={{color:msg.c==='err'?'var(--bad)':'var(--ok)'}}>{msg.t}</p>

      {duplicateId?(
       <div style={{display:'flex',gap:8,marginTop:12}}>
        <button type="button" className="btn hi" disabled={busy} onClick={supportDuplicate}>
         Support it instead
        </button>
        <button type="button" className="btn ghost" onClick={()=>setDuplicateId(null)}>
         Cancel
        </button>
       </div>
      ):(
       <div style={{display:'flex',gap:8,marginTop:12,flexWrap:'wrap'}}>
        <button className="btn hi" disabled={busy}>{busy?'Sending…':'Send report'}</button>
        <button type="button" className="btn ghost" onClick={locate}>Use my location</button>
       </div>
      )}
     </form>

     <div>
      {/* Map with Status-based coloring and high-priority marker */}
      <MapView
       height={320}
       pick={pick}
       onPick={(a,b)=>setPick([a,b])}
       points={rows.map(r=>({
        id:r.id,
        lat:r.lat,
        lng:r.lng,
        color:COLOR[r.status]||'#2b6cff',
        label:`${r.category} (${r.priority} priority): ${LABEL[r.status]}`,
        highPriority:r.priority==='high'
       }))}
      />

      {/* Resident Map Legend */}
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
        <span className="map-legend-dot" style={{backgroundColor:'#2f7d57'}} aria-hidden="true"/>
        <span>Cleared</span>
       </span>
       <span className="map-legend-item">
        <span className="map-legend-high" aria-hidden="true">!</span>
        <span>High priority</span>
       </span>
      </div>

      <h2 className="mt" style={{fontSize:'1.3rem'}}>Your reports</h2>
      <ul className="list">
       {rows.length===0&&<li className="item">No reports yet. Place a pin to send your first.</li>}
       {rows.map(r=>{
        const isAwaiting=(r.needs_review || (r.category==='Other' && !r.priority_override));
        return (
         <li className="item" key={r.id}>
          <div>
           <b>{r.category}</b>
           <small>{r.description}{r.voters>1?` (${r.voters} residents)`:''}</small>
           <div style={{display:'flex',gap:8,alignItems:'center',marginTop:4,flexWrap:'wrap'}}>
            {r.due_at&&r.status!=='cleared'&&r.status!=='rejected'&&(
             <small style={{color:'var(--route)',fontWeight:600}}>{targetClearText(r.due_at)}</small>
            )}
            {r.status==='cleared'&&r.resolution_note&&(
             <small style={{color:'var(--ok)'}}>Crew note: {r.resolution_note}</small>
            )}
           </div>
          </div>

          {/* Consistent Badges in top right row */}
          <ReportBadges
           status={r.status}
           priority={r.status!=='rejected'?r.priority:undefined}
           needsReview={isAwaiting}
          />
         </li>
        );
       })}
      </ul>
     </div>
    </div>
   )}
  </div>
 );
}
