import {FormEvent,useEffect,useState} from 'react';import {Link,useNavigate} from 'react-router-dom';
import {supabase} from '../lib/supabase';import {useAuth} from '../auth';
export default function Login(){
 const nav=useNavigate(),{session}=useAuth();const [up,setUp]=useState(false);const [msg,setMsg]=useState({t:'',c:''});const [busy,setBusy]=useState(false);
 useEffect(()=>{if(session)nav('/app',{replace:true})},[session,nav]);
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);
  const email=String(f.get('email')),password=String(f.get('password')),name=String(f.get('name')||'');
  if(up&&password.length<6)return setMsg({t:'Use a password with at least 6 characters.',c:'err'});
  setBusy(true);
  const r=up?await supabase.auth.signUp({email,password,options:{data:{name}}}):await supabase.auth.signInWithPassword({email,password});
  setBusy(false);
  if(r.error)return setMsg({t:r.error.message,c:'err'});
  if(up&&!r.data.session)return setMsg({t:'Account created. Check your email to confirm it, then sign in.',c:'good'});}
 return <div className="wrap"><div className="narrow panel">
  <Link className="logo" to="/"><i></i>Kerbside</Link>
  <h2 style={{marginTop:16,fontSize:'1.6rem'}}>{up?'Create your account':'Sign in'}</h2>
  <form onSubmit={submit}>
   {up&&<><label htmlFor="name">Name</label><input id="name" name="name" type="text" required/></>}
   <label htmlFor="email">Email</label><input id="email" name="email" type="email" required autoComplete="email"/>
   <label htmlFor="pw">Password</label><input id="pw" name="password" type="password" required autoComplete={up?'new-password':'current-password'}/>
   <p className="msg" role="status" style={{color:msg.c==='err'?'var(--bad)':'var(--ok)'}}>{msg.t}</p>
   <button className="btn hi" disabled={busy}>{up?'Create account':'Sign in'}</button>
   <button type="button" className="btn ghost" onClick={()=>{setUp(!up);setMsg({t:'',c:''})}}>{up?'I have an account':'New here? Sign up'}</button>
  </form></div></div>}
