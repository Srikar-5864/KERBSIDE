import {useCallback,useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';
import MapView from '../MapView';
import Icon from './Icon';
import EmptyState from './EmptyState';

interface Hotspot{id:string;lat:number;lng:number;reports:number;open_reports:number;categories:string[];first_report:string;last_report:string}
export default function Hotspots(){
 const [spots,setSpots]=useState<Hotspot[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[pick,setPick]=useState<[number,number]|null>(null);
 const load=useCallback(async()=>{
  setLoading(true);
  try{
   const {data,error}=await supabase.rpc('complaint_hotspots');
   if(error){
    setError(error.code==='PGRST202'?'Hotspot setup is pending. Run supabase/update-4.sql in the Supabase SQL Editor, then refresh hotspots.':error.message);
    return;
   }
   setSpots(data||[]);setError('');
  }catch(e){setError(e instanceof Error?e.message:'Unable to load hotspots. Please retry.')}finally{setLoading(false)}
 },[]);
 useEffect(()=>{load();const timer=setInterval(load,60000);return()=>clearInterval(timer)},[load]);
 return <div className="panel mt">
  <div className="panel-heading split"><div><h2>Recurring hotspots</h2><p>Three or more reports within 100 metres, over the past 30 days.</p></div><button className="btn ghost" onClick={load} disabled={loading}><Icon name="refresh" size={17}/>Refresh hotspots</button></div>
  {loading&&<p role="status">Checking recurring reports…</p>}
  {error?<p className="msg err" role="alert">{error}</p>:<>
   {!spots.length&&!loading?<EmptyState title="No recurring hotspots" message="Areas with repeated reports will appear here. Rejected reports are excluded, and overlapping areas are grouped once." icon="pin"/>:spots.length>0&&<>
    <MapView height={280} pick={pick} points={spots.map(s=>({id:`hotspot-${s.id}`,lat:s.lat,lng:s.lng,color:'#c8402f',ring:true,label:`${s.reports} reports, ${s.open_reports} open`,onClick:()=>setPick([s.lat,s.lng])}))}/>
    <ul className="list mt">{spots.map(s=><li className="item" key={s.id}>
     <div><b>{s.reports} reports · {s.open_reports} open</b><small>{s.categories.join(', ')}</small><small>Latest: {new Date(s.last_report).toLocaleString()}</small></div>
     <button className="btn ghost" onClick={()=>setPick([s.lat,s.lng])}>Show location</button>
    </li>)}</ul>
   </>}
  </>}
 </div>;
}
