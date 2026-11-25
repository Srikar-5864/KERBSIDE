import {useCallback,useEffect,useRef,useState} from 'react';
import {supabase} from './supabase';
import {CleanupDraft,deleteCleanup,readCleanups,saveCleanup} from './drafts';

export function useCleanupDrafts(userId:string,onSent:()=>void){
 const [drafts,setDrafts]=useState<CleanupDraft[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[online,setOnline]=useState(navigator.onLine);
 const syncing=useRef(false);
 const load=useCallback(async()=>setDrafts(await readCleanups(userId)),[userId]);
 const sync=useCallback(async()=>{
  if(syncing.current||!navigator.onLine)return;
  syncing.current=true;setBusy(true);setError('');
  try{
   for(const draft of await readCleanups(userId)){
    if(!navigator.onLine)break;
    const {data:{session}}=await supabase.auth.getSession();
    if(session?.user.id!==userId)throw new Error('Sign in to the account that saved this cleanup.');
    try{
     const path=`${userId}/done/${draft.reportId}/${draft.id}-${draft.file.name.replace(/[^\w.-]/g,'_')}`;
     const {data:report,error:readError}=await supabase.from('complaints').select('id,status,done_image_path').eq('id',draft.reportId).single();
     if(readError)throw readError;
     if(report.status==='cleared'&&report.done_image_path===path){await deleteCleanup(userId,draft.id);onSent();continue}
     if(report.status!=='assigned')throw new Error('This report is no longer assigned. Your local proof is kept; contact an administrator.');
     const {error:uploadError}=await supabase.storage.from('photos').upload(path,draft.file);
     if(uploadError&&String(uploadError.statusCode)!=='409'&&uploadError.message!=='The resource already exists')throw uploadError;
     const {error}=await supabase.from('complaints').update({
      status:'cleared',resolution_note:draft.note,done_image_path:path,cleared_at:new Date().toISOString(),
      cleared_lat:draft.location.lat,cleared_lng:draft.location.lng,cleared_accuracy:draft.location.accuracy,cleared_location_at:draft.location.capturedAt,
     }).eq('id',draft.reportId).eq('collector_id',userId).eq('status','assigned').select('id').single();
     if(error)throw error;
     await deleteCleanup(userId,draft.id);onSent();
    }catch(e){await saveCleanup({...draft,error:e instanceof Error?e.message:typeof e==='object'&&e&&'message' in e?String(e.message):'Unable to sync. Cleanup and GPS tag remain saved.'})}
   }
  }catch(e){setError(e instanceof Error?e.message:'Unable to read saved cleanups.')}
  finally{try{await load()}catch{setError('Unable to read local cleanups. Please retry.')}syncing.current=false;setBusy(false)}
 },[userId,onSent,load]);
 useEffect(()=>{
  load().catch(()=>setError('Offline storage is unavailable. Check browser storage permissions.'));sync();
  const connected=()=>{setOnline(true);sync()},disconnected=()=>setOnline(false);
  window.addEventListener('online',connected);window.addEventListener('offline',disconnected);
  return()=>{window.removeEventListener('online',connected);window.removeEventListener('offline',disconnected)};
 },[load,sync]);
 async function save(draft:CleanupDraft){await saveCleanup(draft);await load();await sync()}
 async function remove(id:string){await deleteCleanup(userId,id);await load()}
 return {drafts,busy,error,online,save,remove,sync};
}
