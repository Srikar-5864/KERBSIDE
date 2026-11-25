import {useState} from 'react';
import {ReportDraft} from '../lib/drafts';
import {useReportDrafts} from '../lib/useReportDrafts';
import Icon from './Icon';
import EmptyState from './EmptyState';

export default function SavedReports({queue}:{queue:ReturnType<typeof useReportDrafts>}){
 const [error,setError]=useState(''),[acting,setActing]=useState(false);
 async function act(action:()=>Promise<void>){
  setActing(true);setError('');try{await action()}catch(e){setError(e instanceof Error?e.message:typeof e==='object'&&e&&'message' in e?String(e.message):'Unable to update this draft. Please retry.')}finally{setActing(false)}
 }
 function discard(draft:ReportDraft){if(window.confirm('Delete this saved report and its local photo?'))act(()=>queue.remove(draft.id))}
 return <div className="panel mt">
  <div className="detail-heading"><h3>Saved reports ({queue.drafts.length})</h3><span>{queue.online?'Online':'Offline'}</span></div>
  <p className="detail-hint">Your reports and photos are saved on this device. We’ll retry when you reconnect or reopen the app with this account.</p>
  {(queue.error||error)&&<p className="msg err" role="alert">{error||queue.error}</p>}
  {queue.busy&&<p role="status">Sending saved reports…</p>}
  {!queue.drafts.length&&<EmptyState title="Everything is in sync" message="Reports saved offline will appear here until they’ve been safely sent." icon="cloud"/>}
  <ul className="list">{queue.drafts.map(draft=><li className="item saved-report" key={draft.id}>
   <div><b>{draft.category}</b><small>{draft.description}</small><small>{new Date(draft.createdAt).toLocaleString()} · {draft.file?'Photo saved':'No photo'}</small></div>
   {draft.error&&<p className="msg err">{draft.error}</p>}
   <div className="detail-actions">
    {draft.duplicateId&&<button className="btn hi" disabled={!queue.online||queue.busy||acting} onClick={()=>act(()=>queue.support(draft))}>Support existing report</button>}
    <button className="btn ghost" disabled={queue.busy||acting} onClick={()=>discard(draft)}>Discard draft</button>
   </div>
  </li>)}</ul>
  {queue.drafts.length>0&&<button type="button" className="btn hi mt" disabled={!queue.online||queue.busy||acting} onClick={queue.sync}><Icon name="refresh" size={17}/>Retry saved reports</button>}
 </div>;
}
