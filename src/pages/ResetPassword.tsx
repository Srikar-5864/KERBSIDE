import {FormEvent,useState} from 'react';import {Link} from 'react-router-dom';
import {supabase} from '../lib/supabase';import {useAuth} from '../auth';
import AuthLayout from '../components/AuthLayout';import Icon from '../components/Icon';

export default function ResetPassword(){
 const {session,loading}=useAuth();const [busy,setBusy]=useState(false);const [done,setDone]=useState(false);const [msg,setMsg]=useState('');
 const [linkError]=useState(()=>{
  const params=new URLSearchParams(`${window.location.search.slice(1)}&${window.location.hash.slice(1)}`);
  return params.has('error')||params.has('error_code')||params.has('error_description');
 });
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();const f=new FormData(e.currentTarget);const password=String(f.get('password')||'');
  if(password.length<6)return setMsg('Use a password with at least 6 characters.');
  if(password!==f.get('confirm'))return setMsg('Passwords do not match.');
  setBusy(true);setMsg('');
  try{
   const {error}=await supabase.auth.updateUser({password});
   if(error)setMsg(error.message);else setDone(true);
  }catch{setMsg('Unable to connect. Please try again.')}finally{setBusy(false)}
 }
 return <AuthLayout>
  <span className="auth-form-icon"><Icon name="shield" size={25}/></span>
  <p className="eyebrow">A FRESH START</p>
  <h1>Reset password.</h1>
  <p className="auth-description">Choose a new password to get back to your neighborhood.</p>
  {loading?<p role="status">Checking your reset link…</p>:linkError||!session?<>
   <p className="msg err" role="alert">This reset link is invalid or has expired. Request a new link from the sign-in page.</p>
   <Link className="btn ghost auth-submit" to="/login">Back to sign in</Link>
  </>:done?<>
   <p className="msg good" role="status">Your password has been updated.</p>
   <Link className="btn hi auth-submit" to="/app">Continue to dashboard</Link>
  </>:<form className="auth-form" onSubmit={submit}>
   <label htmlFor="new-password">New password</label>
   <input id="new-password" name="password" type="password" required minLength={6} autoComplete="new-password" disabled={busy}/>
   <label htmlFor="confirm-password">Confirm new password</label>
   <input id="confirm-password" name="confirm" type="password" required minLength={6} autoComplete="new-password" disabled={busy}/>
   <p className="msg err" role="status">{msg}</p>
   <button className="btn hi auth-submit" disabled={busy}>{busy?'Updating…':'Update password'}</button>
  </form>}
 </AuthLayout>
}
