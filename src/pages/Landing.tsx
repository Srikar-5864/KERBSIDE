import {Link} from 'react-router-dom';import {useAuth} from '../auth';
export default function Landing(){
 const {session}=useAuth();const go=session?'/app':'/login';
 return <div className="wrap"><header><Link className="logo" to="/"><i></i>Kerbside</Link><nav><Link to={go}>{session?'Open dashboard':'Sign in'}</Link></nav></header>
 <main><div style={{padding:'28px 0 48px',maxWidth:720}}>
  <h1>Spot it. Snap it. <span>Cleared.</span></h1>
  <p className="lede">Kerbside connects residents, collection crews and the city office on one live map, so an overflowing bin gets reported in a minute and cleared the same day.</p>
  <Link className="btn hi" to={go}>Report a problem</Link></div>
 <div className="grid3" style={{paddingBottom:56}}>
  <div className="card"><h3>Residents</h3><p>Report with a photo, a note and a map pin. Follow each report until it is cleared and earn reward points.</p></div>
  <div className="card"><h3>Crews</h3><p>See your assigned jobs on a route ordered by distance, then close each one with a photo and a remark.</p></div>
  <div className="card"><h3>City office</h3><p>Watch every complaint, spot hotspots, assign crews, track their results and export reports.</p></div></div></main>
 <footer>Kerbside is a student project from Dayananda Sagar College of Engineering, Bengaluru.</footer></div>}
