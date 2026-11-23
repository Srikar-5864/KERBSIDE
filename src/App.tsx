import {Link,Navigate,Route,Routes} from 'react-router-dom';
import {useAuth} from './auth';import {supabase,configured} from './lib/supabase';
import {levelFor} from './lib/levels';
import Landing from './pages/Landing';import Login from './pages/Login';import Citizen from './pages/Citizen';import Crew from './pages/Crew';import Admin from './pages/Admin';

function Dashboard(){
 const {session,profile,loading}=useAuth();
 if(loading)return <div className="wrap"><p>Loading…</p></div>;
 if(!session)return <Navigate to="/login" replace/>;
 if(!profile)return <div className="wrap"><p className="msg err">Your profile is missing. Run supabase/schema.sql, then sign up again.</p></div>;
 const lvl = levelFor(profile.points || 0);

 return (
  <div className="wrap">
   <div className="top">
    <Link className="logo" to="/"><i></i>Kerbside</Link>
    <div className="who">
     <span>{profile.name||'Signed in'} ({profile.role})</span>

     {profile.role==='citizen'&&(
      <div className="level-chip" aria-label={`Resident level: ${lvl.name}, ${profile.points} points`}>
       <span style={{fontWeight:700,color:'var(--ink)'}}>{lvl.name}</span>
       <div className="level-chip-bar-bg" role="progressbar" aria-valuenow={lvl.progressPercent} aria-valuemin={0} aria-valuemax={100}>
        <div className="level-chip-bar-fill" style={{width:`${lvl.progressPercent}%`}}/>
       </div>
       <span className="level-chip-text">
        {lvl.next
         ? `${profile.points} / ${lvl.nextGoal} points, ${lvl.toNext} to ${lvl.next}`
         : `${profile.points} points, Top level`}
       </span>
      </div>
     )}

     <button className="btn ghost" style={{margin:0}} onClick={()=>supabase.auth.signOut()}>Sign out</button>
    </div>
   </div>
   {profile.role==='citizen'?<Citizen/>:profile.role==='collector'?<Crew/>:<Admin/>}
  </div>
 );
}

export default function App(){
 return (
  <>
   {!configured&&<p className="msg err" style={{padding:'8px 20px',margin:0}}>Add your Supabase keys to .env (see README) to turn on sign-in and data.</p>}
   <Routes>
    <Route path="/" element={<Landing/>}/>
    <Route path="/login" element={<Login/>}/>
    <Route path="/app" element={<Dashboard/>}/>
    <Route path="*" element={<Navigate to="/" replace/>}/>
   </Routes>
  </>
 );
}
