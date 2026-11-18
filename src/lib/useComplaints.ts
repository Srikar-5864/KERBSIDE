import {useCallback,useEffect,useState} from 'react';
import {supabase} from './supabase';import {Complaint} from './types';
export function useComplaints(){
 const [rows,setRows]=useState<Complaint[]>([]);
 const load=useCallback(async()=>{const {data}=await supabase.from('complaints').select('*').order('created_at',{ascending:false});setRows((data??[]) as Complaint[])},[]);
 useEffect(()=>{load();const ch=supabase.channel('c-'+Math.random()).on('postgres_changes',{event:'*',schema:'public',table:'complaints'},()=>{load()}).subscribe();const t=setInterval(load,10000);return()=>{clearInterval(t);supabase.removeChannel(ch)}},[load]);
 return {rows,load};
}
