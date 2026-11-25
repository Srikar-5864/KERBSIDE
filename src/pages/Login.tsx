import {FormEvent,useEffect,useState} from 'react';import {useNavigate} from 'react-router-dom';
import {supabase} from '../lib/supabase';import {useAuth} from '../auth';
import AuthLayout from '../components/AuthLayout';
import Icon from '../components/Icon';
export default function Login(){
 const nav=useNavigate(),{session}=useAuth();const [up,setUp]=useState(false);const [forgot,setForgot]=useState(false);const [msg,setMsg]=useState({t:'',c:''});const [busy,setBusy]=useState(false);
 useEffect(()=>{if(session)nav('/app',{replace:true})},[session,nav]);
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);
  const email=String(f.get('email')),password=String(f.get('password')),name=String(f.get('name')||'');
  if(up&&password.length<6)return setMsg({t:'Use a password with at least 6 characters.',c:'err'});
  setBusy(true);setMsg({t:'',c:''});
  try{
  if(forgot){
   const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:`${window.location.origin}/reset-password`});
   setMsg(error?{t:error.message,c:'err'}:{t:'If an account exists for this email, you will receive a password reset link. Check your inbox and spam folder.',c:'good'});
   return;
  }
  const r=up?await supabase.auth.signUp({email,password,options:{data:{name}}}):await supabase.auth.signInWithPassword({email,password});
  if(r.error)return setMsg({t:r.error.message,c:'err'});
  if(up&&!r.data.session)return setMsg({t:'Account created. Check your email to confirm it, then sign in.',c:'good'});
  }catch{setMsg({t:'Unable to connect. Please try again.',c:'err'})}finally{setBusy(false)}}
 return <AuthLayout>
  <span className="auth-form-icon"><Icon name={forgot?'shield':up?'users':'leaf'} size={25}/></span>
  <p className="eyebrow">{forgot?'LET’S GET YOU BACK IN':up?'JOIN YOUR NEIGHBORHOOD':'YOUR NEIGHBORHOOD IS WAITING'}</p>
  <h1>{forgot?'Forgot password?':up?'Create your account.':'Welcome back.'}</h1>
  <p className="auth-description">{forgot?'Enter your account email and we’ll send you a link to reset your password.':up?'Join the people making your neighborhood a cleaner place to live.':'Sign in to follow your reports and pick up where you left off.'}</p>
  <form className="auth-form" onSubmit={submit}>
   {up&&<><label htmlFor="name">Name</label><input id="name" name="name" type="text" placeholder="Your full name" autoComplete="name" disabled={busy} required/></>}
   <label htmlFor="email">Email</label><input id="email" name="email" type="email" placeholder="you@example.com" disabled={busy} required autoComplete="email"/>
   {!forgot&&<><div className="auth-password-heading"><label htmlFor="pw">Password</label>{!up&&<button type="button" className="auth-text-button" disabled={busy} onClick={()=>{setForgot(true);setMsg({t:'',c:''})}}>Forgot password?</button>}</div><input id="pw" name="password" type="password" placeholder={up?'Choose a strong password':'Enter your password'} disabled={busy} required minLength={up?6:undefined} autoComplete={up?'new-password':'current-password'}/>{up&&<p className="field-help">Use at least 6 characters.</p>}</>}
   <p className={`msg ${msg.c}`} role="status">{msg.t}</p>
   <button className="btn hi auth-submit" disabled={busy}>{busy?'Please wait…':forgot?'Send reset link':up?'Create account':'Sign in'}</button>
   <div className="auth-switch"><span>{forgot?'Remember your password?':up?'Already part of the neighborhood?':'A cleaner neighborhood starts with you.'}</span><button type="button" className="auth-text-button" disabled={busy} onClick={()=>{setUp(forgot?false:!up);setForgot(false);setMsg({t:'',c:''})}}>{forgot?'Back to sign in':up?'I have an account':'New here? Sign up'}</button></div>
  </form>
 </AuthLayout>}
