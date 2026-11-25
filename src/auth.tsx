import {createContext,ReactNode,useCallback,useContext,useEffect,useState} from 'react';
import {Session} from '@supabase/supabase-js';
import {supabase} from './lib/supabase';import {Profile} from './lib/types';
import {readCache,writeCache} from './lib/offlineCache';
interface A{session:Session|null;profile:Profile|null;loading:boolean;refresh:()=>Promise<void>}
const Ctx=createContext<A>({session:null,profile:null,loading:true,refresh:async()=>{}});
export const useAuth=()=>useContext(Ctx);
export function AuthProvider({children}:{children:ReactNode}){
 const [session,setSession]=useState<Session|null>(null);const [profile,setProfile]=useState<Profile|null>(null);const [loading,setLoading]=useState(true);
 const fetchProfile=useCallback(async(s:Session|null)=>{
  if(!s){setProfile(null);return}
  const cached=readCache<Profile|null>(`profile:${s.user.id}`,null);
  if(!navigator.onLine){setProfile(cached);return}
  const {data,error}=await supabase.from('profiles').select('*').eq('id',s.user.id).single();
  if(data)writeCache(`profile:${s.user.id}`,data);
  setProfile((error?cached:data) as Profile|null)},[]);
 useEffect(()=>{
  supabase.auth.getSession().then(async({data})=>{setSession(data.session);await fetchProfile(data.session);setLoading(false)});
  const {data:sub}=supabase.auth.onAuthStateChange((_e,s)=>{setSession(s);fetchProfile(s)});
  return()=>sub.subscription.unsubscribe()},[fetchProfile]);
 const refresh=useCallback(()=>fetchProfile(session),[fetchProfile,session]);
 return <Ctx.Provider value={{session,profile,loading,refresh}}>{children}</Ctx.Provider>}
