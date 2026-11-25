import {FormEvent,useCallback,useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';
import {Complaint,LABEL,Status} from '../lib/types';

interface Event{id:number;event:string;status:Status;note:string|null;actor_name:string;created_at:string}
interface Comment{id:string;author_name:string;author_role:string;body:string;created_at:string}

export default function ComplaintDetails({report}:{report:Complaint}){
 const [open,setOpen]=useState(false),[events,setEvents]=useState<Event[]>([]),[comments,setComments]=useState<Comment[]>([]);
 const [body,setBody]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false);
 const after=report.done_image_path?supabase.storage.from('photos').getPublicUrl(report.done_image_path).data.publicUrl:report.done_image_url;
 const load=useCallback(async()=>{
  setLoading(true);
  try{
   const [a,b]=await Promise.all([
    supabase.from('complaint_events').select('*').eq('complaint_id',report.id).order('created_at').order('id'),
    supabase.from('complaint_comments').select('*').eq('complaint_id',report.id).order('created_at').order('id'),
   ]);
   if(a.error||b.error)throw a.error||b.error;
   setEvents(a.data||[]);setComments(b.data||[]);setError('');
  }catch(e){setError(e instanceof Error?e.message:'Could not load report details. Please retry.')}finally{setLoading(false)}
 },[report.id]);
 useEffect(()=>{
  if(!open)return;
  load();const timer=setInterval(load,10000);return()=>clearInterval(timer);
 },[open,load,report.status]);
 async function comment(e:FormEvent){
  e.preventDefault();if(!body.trim())return;
  setBusy(true);setError('');
  try{
   const {error}=await supabase.rpc('add_complaint_comment',{p_complaint:report.id,p_body:body.trim()});
   if(error)throw error;
   setBody('');await load();
  }catch(e){setError(e instanceof Error?e.message:'Could not post your comment. Please retry.')}finally{setBusy(false)}
 }
 return <details className="report-details" onToggle={e=>setOpen(e.currentTarget.open)}>
  <summary>Timeline, photos & comments</summary>
  {open&&<div>
   <div className="report-photos">
    <figure><figcaption>Before cleanup</figcaption>{report.image_url?<a href={report.image_url} target="_blank" rel="noreferrer"><img src={report.image_url} alt="Waste before cleanup" loading="lazy"/></a>:<p>No original photo provided.</p>}</figure>
    <figure><figcaption>After cleanup</figcaption>{after?<a href={after} target="_blank" rel="noreferrer"><img src={after} alt="Location after cleanup" loading="lazy"/></a>:<p>{report.status==='cleared'?'No completion photo on this older report.':'Awaiting cleanup.'}</p>}</figure>
   </div>
   {report.cleared_lat!=null&&report.cleared_lng!=null&&<p className="detail-hint">Cleanup GPS: {report.cleared_lat.toFixed(5)}, {report.cleared_lng.toFixed(5)} · accuracy ±{Math.round(report.cleared_accuracy||0)} m{report.cleared_location_at&&<> · Captured {new Date(report.cleared_location_at).toLocaleString()}</>}</p>}
   {report.resolution_note&&<p><b>Crew note:</b> {report.resolution_note}</p>}
   <h3>Timeline</h3>
   <ol className="report-timeline">{events.map(event=><li key={event.id}>
    <b>{event.event} — {LABEL[event.status]||event.status}</b>
    <small><time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString()}</time> · {event.actor_name}</small>
    {event.note&&<p>{event.note}</p>}
   </li>)}</ol>
   {!events.length&&!loading&&!error&&<p>No history recorded yet.</p>}
   <h3>Comments</h3>
   <p className="detail-hint">Visible to the reporter, assigned crew, and administrators.</p>
   <ul className="report-comments">{comments.map(comment=><li key={comment.id}>
    <b>{comment.author_name}</b> <small>({comment.author_role}) · <time dateTime={comment.created_at}>{new Date(comment.created_at).toLocaleString()}</time></small>
    <p>{comment.body}</p>
   </li>)}</ul>
   {!comments.length&&!loading&&!error&&<p>No comments yet.</p>}
   {loading&&<p role="status">Refreshing details…</p>}
   {error&&<p className="msg err" role="alert">{error} <button type="button" className="btn ghost" onClick={load}>Retry</button></p>}
   <form onSubmit={comment}>
    <label htmlFor={`comment-${report.id}`}>Add a comment</label>
    <textarea id={`comment-${report.id}`} value={body} onChange={e=>setBody(e.target.value)} maxLength={2000} required disabled={busy}/>
    <button className="btn hi" disabled={busy||!body.trim()}>{busy?'Posting…':'Post comment'}</button>
   </form>
  </div>}
 </details>;
}
