import {useEffect,useState} from 'react';
import {Link,Navigate,Route,Routes,useSearchParams} from 'react-router-dom';
import {useAuth} from './auth';import {supabase,configured} from './lib/supabase';
import {levelFor} from './lib/levels';
import Landing from './pages/Landing';import Login from './pages/Login';import Citizen from './pages/Citizen';import Crew from './pages/Crew';import Admin from './pages/Admin';
import ResetPassword from './pages/ResetPassword';
import Icon,{IconName} from './components/Icon';
import './dashboard.css';

const navigation:{[role:string]:{id:string;label:string;icon:IconName}[]}={
 citizen:[{id:'overview',label:'My neighborhood',icon:'overview'},{id:'report',label:'Report an issue',icon:'plus'},{id:'community',label:'Community',icon:'users'},{id:'saved',label:'Saved reports',icon:'cloud'}],
 collector:[{id:'route',label:'My route',icon:'truck'},{id:'completed',label:'Completed jobs',icon:'check'},{id:'saved',label:'Saved cleanups',icon:'cloud'}],
 admin:[{id:'overview',label:'Overview',icon:'overview'},{id:'reports',label:'All reports',icon:'reports'},{id:'map',label:'City map',icon:'pin'},{id:'hotspots',label:'Hotspots',icon:'spark'},{id:'team',label:'Team & access',icon:'users'}],
};
function Dashboard(){
 const {session,profile,loading}=useAuth();
 const [params]=useSearchParams();
 const [menuOpen,setMenuOpen]=useState(false),[online,setOnline]=useState(navigator.onLine);
 const [signingOut,setSigningOut]=useState(false),[authError,setAuthError]=useState('');
 useEffect(()=>{const update=()=>setOnline(navigator.onLine);window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update)}},[]);
 useEffect(()=>setMenuOpen(false),[params]);
 useEffect(()=>{
  if(!menuOpen)return;
  const body=document.querySelector('.workspace-body'),sidebar=document.querySelector<HTMLElement>('.workspace-sidebar'),previous=document.activeElement as HTMLElement|null;
  body?.setAttribute('inert','');sidebar?.querySelector<HTMLElement>('[aria-current="page"]')?.focus();
  const keydown=(event:KeyboardEvent)=>{
   if(event.key==='Escape')setMenuOpen(false);
   if(event.key!=='Tab'||!sidebar)return;
   const controls=Array.from(sidebar.querySelectorAll<HTMLElement>('a,button:not(:disabled)')),first=controls[0],last=controls[controls.length-1];
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
  };
  const resize=()=>{if(window.innerWidth>760)setMenuOpen(false)};
  document.addEventListener('keydown',keydown);window.addEventListener('resize',resize);
  return()=>{body?.removeAttribute('inert');document.removeEventListener('keydown',keydown);window.removeEventListener('resize',resize);previous?.focus()};
 },[menuOpen]);
 if(loading)return <div className="workspace workspace-loading" role="status"><span className="loading-ring"/>Opening your workspace…</div>;
 if(!session)return <Navigate to="/login" replace/>;
 if(!profile)return <div className="wrap"><p className="msg err">Your profile could not be loaded. Reconnect and refresh, or contact your administrator.</p></div>;
 const items=navigation[profile.role],active=items.find(item=>item.id===params.get('view'))||items[0],lvl=levelFor(profile.points||0);
 const roleName=profile.role==='admin'?'City office':profile.role==='collector'?'Field operations':'Resident workspace';
 const initials=(profile.name||'Kerbside').split(/\s+/).slice(0,2).map(word=>word[0]).join('').toUpperCase();
 async function signOut(){setSigningOut(true);setAuthError('');try{const {error}=await supabase.auth.signOut();if(error)throw error}catch{setAuthError('Could not sign out. Please retry.')}finally{setSigningOut(false)}}
 return <div className={`workspace role-${profile.role}`}>
  <a className="skip-link" href="#workspace-main">Skip to content</a>
  {menuOpen&&<button className="sidebar-backdrop" aria-label="Close navigation" onClick={()=>setMenuOpen(false)}/>}
  <aside className={`workspace-sidebar ${menuOpen?'is-open':''}`} role={menuOpen?'dialog':undefined} aria-modal={menuOpen?true:undefined} aria-label="Workspace sidebar">
   <Link className="logo workspace-logo" to="/"><i/>Kerbside<span>WORKSPACE</span></Link>
   <div className="sidebar-caption">{roleName}</div>
   <nav className="workspace-nav" aria-label="Dashboard navigation">{items.map(item=><Link key={item.id} to={`/app?view=${item.id}`} aria-current={item.id===active.id?'page':undefined}><Icon name={item.icon}/><span>{item.label}</span></Link>)}</nav>
   <div className="sidebar-note"><Icon name="leaf" size={25}/><b>Small actions.<br/>Cleaner neighborhoods.</b><p>One report. One cleanup.<br/>A better place to live.</p></div>
   <div className="sidebar-account"><span className="avatar">{initials}</span><div><b>{profile.name||'Your account'}</b><small>{roleName}</small></div></div>
   <button className="sidebar-signout" disabled={signingOut} onClick={signOut}><Icon name="logout"/>{signingOut?'Signing out…':'Sign out'}</button>
   {authError&&<p className="sidebar-error" role="alert">{authError}</p>}
  </aside>
  <div className="workspace-body">
   <div className="workspace-topbar">
    <div className="topbar-location"><button className="icon-button mobile-menu" aria-label="Open navigation" aria-expanded={menuOpen} onClick={()=>setMenuOpen(!menuOpen)}><Icon name="menu"/></button><span className="breadcrumb-parent">{roleName}</span><span className="breadcrumb-divider">/</span><b>{active.label}</b></div>
    <div className="topbar-actions"><span className={`connection ${online?'':'is-offline'}`}><span/>{online?'Connected':'Offline'}</span><time className="topbar-date" dateTime={new Date().toISOString().slice(0,10)}>{new Date().toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</time><span className="avatar topbar-avatar" aria-label={profile.name||'Your account'}>{initials}</span></div>
   </div>
   <main id="workspace-main" className="workspace-content" tabIndex={-1}>
    {!online&&<div className="offline-notice" role="status"><Icon name="cloud"/><span>You’re offline. Saved reports, photos, and GPS tags will sync when you reconnect.</span></div>}
    {profile.role==='citizen'&&<div className="resident-level"><Icon name="leaf" size={17}/><b>{lvl.name}</b><span>{profile.points} points</span><span className="resident-progress" role="progressbar" aria-label="Resident level progress" aria-valuenow={lvl.progressPercent} aria-valuemin={0} aria-valuemax={100}><i style={{width:`${lvl.progressPercent}%`}}/></span><small>{lvl.next?`${lvl.toNext} to ${lvl.next}`:'Top resident level'}</small></div>}
    {profile.role==='citizen'?<Citizen view={active.id}/>:profile.role==='collector'?<Crew view={active.id}/>:<Admin view={active.id}/>}
   </main>
   <div className="workspace-footer"><span>Kerbside · Better streets, together.</span><span>Bengaluru, India</span></div>
  </div>
 </div>;
}

export default function App(){
 return (
  <>
   {!configured&&<p className="msg err" style={{padding:'8px 20px',margin:0}}>Add your Supabase keys to .env (see README) to turn on sign-in and data.</p>}
   <Routes>
    <Route path="/" element={<Landing/>}/>
    <Route path="/login" element={<Login/>}/>
    <Route path="/reset-password" element={<ResetPassword/>}/>
    <Route path="/app" element={<Dashboard/>}/>
    <Route path="*" element={<Navigate to="/" replace/>}/>
   </Routes>
  </>
 );
}
