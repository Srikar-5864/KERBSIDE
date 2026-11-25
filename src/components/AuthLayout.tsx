import {ReactNode} from 'react';
import {Link} from 'react-router-dom';
import Icon from './Icon';

export default function AuthLayout({children}:{children:ReactNode}){
 return <div className="workspace auth-page">
  <div className="auth-brand">
   <Link className="logo auth-logo" to="/"><i/>Kerbside</Link>
   <div className="auth-story"><p className="eyebrow">A LITTLE CARE GOES A LONG WAY</p><h2>Cleaner streets.<br/><span>Stronger communities.</span></h2><p>A better neighborhood starts with the people who call it home. Let’s make yours a little cleaner, together.</p>
    <div className="auth-illustration" aria-hidden="true"><svg viewBox="0 0 460 220" fill="none"><path d="M-20 88H480M-20 156H480M94-20V240M236-20V240M370-20V240" stroke="currentColor" strokeWidth="17"/><rect x="117" y="20" width="93" height="43" rx="10" fill="currentColor"/><rect x="262" y="20" width="80" height="43" rx="10" fill="currentColor"/><rect x="14" y="109" width="53" height="25" rx="7" fill="currentColor"/><rect x="263" y="110" width="80" height="25" rx="7" fill="currentColor"/><rect x="119" y="179" width="92" height="42" rx="9" fill="currentColor"/><rect x="392" y="110" width="70" height="110" rx="9" fill="currentColor"/><path d="M94 210v-54h142V88h134" stroke="#79aaff" strokeWidth="3" strokeDasharray="6 6"/><circle cx="94" cy="185" r="21" fill="#2e6ddd"/><path d="m85 185 6 6 12-14" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/><circle cx="236" cy="88" r="18" fill="#b9d2ff"/><circle cx="236" cy="88" r="5" fill="#2e6ddd"/><circle cx="370" cy="88" r="8" fill="#2e6ddd"/></svg><span><Icon name="leaf" size={16}/>Your neighborhood, connected.</span></div>
    <div className="auth-benefits"><span><Icon name="pin" size={18}/>Report an issue</span><span><Icon name="truck" size={18}/>Follow the progress</span><span><Icon name="check" size={18}/>See the difference</span></div>
   </div>
   <p className="auth-brand-footer">Made for better neighborhoods. Starting in Bengaluru.</p>
  </div>
  <main className="auth-main">
   <div className="auth-topline"><Link className="logo auth-mobile-logo" to="/"><i/>Kerbside</Link><Link className="auth-home-link" to="/">Back to home</Link></div>
   <div className="auth-form-wrap">{children}</div>
   <div className="auth-footer"><Icon name="shield" size={16}/><span>A shared effort. A cleaner city.</span></div>
  </main>
 </div>;
}
