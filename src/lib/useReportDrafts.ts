import {useCallback,useEffect,useRef,useState} from 'react';
import {supabase} from './supabase';
import {deleteDraft,readDrafts,ReportDraft,saveDraft} from './drafts';

export function useReportDrafts(userId:string,onSent:()=>void){
 const [drafts,setDrafts]=useState<ReportDraft[]>([]),[online,setOnline]=useState(navigator.onLine),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const syncing=useRef(false);
 const load=useCallback(async()=>{setDrafts((await readDrafts(userId)).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)))},[userId]);
 const sync=useCallback(async()=>{
  if(syncing.current||!navigator.onLine)return;
  syncing.current=true;setBusy(true);setError('');
  try{
   for(const draft of await readDrafts(userId)){
    if(!navigator.onLine)break;
    const {data:{session}}=await supabase.auth.getSession();
    if(session?.user.id!==userId)throw new Error('Sign back in to the account that saved these reports.');
    if(draft.duplicateId)continue;
    try{
     let image:string|null=null;
     if(draft.file){
      const path=`${userId}/reports/${draft.id}/${draft.file.name.replace(/[^\w.-]/g,'_')}`;
      const {error}=await supabase.storage.from('photos').upload(path,draft.file);
      if(error&&String(error.statusCode)!=='409'&&error.message!=='The resource already exists')throw error;
      image=supabase.storage.from('photos').getPublicUrl(path).data.publicUrl;
     }
     const {data,error}=await supabase.rpc('submit_complaint',{
      p_category:draft.category,p_description:draft.description,p_lat:draft.lat,p_lng:draft.lng,p_image:image,p_request_id:draft.id,p_reporter:userId,
     });
     if(error)throw error;
     if(data?.result==='duplicate')await saveDraft({...draft,duplicateId:data.id,error:'This problem is already reported nearby. Support that report instead, or discard this draft.'});
     else if(data?.result==='created'){await deleteDraft(userId,draft.id);onSent()}
     else throw new Error('No submission confirmation received. Your draft is kept for retry.');
    }catch(e){
     await saveDraft({...draft,error:e instanceof Error?e.message:typeof e==='object'&&e&&'message' in e?String(e.message):'Unable to send. Your draft is saved for retry.'});
    }
   }
  }catch(e){setError(e instanceof Error?e.message:'Unable to access saved reports. Please retry.')}
  finally{try{await load()}catch{setError('Unable to read saved reports. Your form data has not been removed.')}syncing.current=false;setBusy(false)}
 },[userId,load,onSent]);
 useEffect(()=>{
  load().catch(()=>setError('Draft storage is unavailable. Check browser storage permissions.'));
  sync();
  const connected=()=>{setOnline(true);sync()},disconnected=()=>setOnline(false);
  window.addEventListener('online',connected);window.addEventListener('offline',disconnected);
  return()=>{window.removeEventListener('online',connected);window.removeEventListener('offline',disconnected)};
 },[load,sync]);
 async function save(draft:ReportDraft){await saveDraft(draft);await load()}
 async function remove(id:string){await deleteDraft(userId,id);await load()}
 async function support(draft:ReportDraft){
  if(!draft.duplicateId)return;
  const {data:{session}}=await supabase.auth.getSession();
  if(session?.user.id!==userId)throw new Error('Sign back in to the account that saved this draft.');
  const {error}=await supabase.rpc('cast_vote',{p_complaint:draft.duplicateId,p_lat:draft.lat,p_lng:draft.lng});
  if(error)throw error;
  await remove(draft.id);onSent();
 }
 return {drafts,online,busy,error,save,remove,support,sync};
}
