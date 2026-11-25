import {useCallback,useEffect,useState} from 'react';
import {supabase} from './supabase';import {Complaint} from './types';import {useAuth} from '../auth';import {readCache,writeCache} from './offlineCache';
export function useComplaints(){
 const {session}=useAuth();const userId=session?.user.id;
 const [rows,setRows]=useState<Complaint[]>([]);
 const load=useCallback(async()=>{
  if(!userId){setRows([]);return}
  const key=`complaints:${userId}`,cached=readCache<Complaint[]>(key,[]);
  if(!navigator.onLine){setRows(cached);return}
  const {data,error}=await supabase.from('complaints').select('*').order('created_at',{ascending:false});
  if(error){setRows(cached);return}
  const reports=(data??[]) as Complaint[];writeCache(key,reports);setRows(reports);
 },[userId]);
 useEffect(()=>{load();const ch=supabase.channel('c-'+Math.random()).on('postgres_changes',{event:'*',schema:'public',table:'complaints'},()=>{load()}).subscribe();const t=setInterval(load,10000);return()=>{clearInterval(t);supabase.removeChannel(ch)}},[load]);
 return {rows,load};
}
