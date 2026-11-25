import {CleanupLocation} from './geolocation';
export interface ReportDraft{
 id:string;userId:string;category:string;description:string;lat:number;lng:number;file:File|null;createdAt:string;error?:string;duplicateId?:string;
}
export interface CleanupDraft{
 id:string;userId:string;reportId:string;note:string;file:File;location:CleanupLocation;createdAt:string;error?:string;
}

function store<T>(userId:string,mode:IDBTransactionMode,action:(store:IDBObjectStore)=>IDBRequest<T>,table='reports'):Promise<T>{
 return new Promise((resolve,reject)=>{
  if(!userId)return reject(new Error('Sign in before accessing drafts.'));
  const open=indexedDB.open('kerbside-drafts',2);let blocked=false;
  open.onupgradeneeded=()=>{for(const name of ['reports','cleanups'])if(!open.result.objectStoreNames.contains(name)){const s=open.result.createObjectStore(name,{keyPath:['userId','id']});s.createIndex('userId','userId')}};
  open.onerror=()=>reject(open.error);
  open.onblocked=()=>{blocked=true;reject(new Error('Close other Kerbside tabs and try saving again.'))};
  open.onsuccess=()=>{
   const db=open.result;if(blocked){db.close();return}db.onversionchange=()=>db.close();
   try{
    const tx=db.transaction(table,mode),request=action(tx.objectStore(table));
    tx.oncomplete=()=>{db.close();resolve(request.result)};
    tx.onabort=()=>{db.close();reject(tx.error||new Error('Draft could not be saved. Please retry.'))};
   }catch(e){db.close();reject(e)}
  };
 });
}
export const readDrafts=(userId:string)=>store(userId,'readonly',s=>s.index('userId').getAll(userId)) as Promise<ReportDraft[]>;
export const saveDraft=(draft:ReportDraft)=>store(draft.userId,'readwrite',s=>s.put(draft));
export const deleteDraft=(userId:string,id:string)=>store(userId,'readwrite',s=>s.delete([userId,id]));
export const readCleanups=(userId:string)=>store(userId,'readonly',s=>s.index('userId').getAll(userId),'cleanups') as Promise<CleanupDraft[]>;
export const saveCleanup=(draft:CleanupDraft)=>store(draft.userId,'readwrite',s=>s.put(draft),'cleanups');
export const deleteCleanup=(userId:string,id:string)=>store(userId,'readwrite',s=>s.delete([userId,id]),'cleanups');
