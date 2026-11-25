import {ReactNode} from 'react';
import Icon,{IconName} from './Icon';
export default function StatCard({label,value,hint,icon,tone='green'}:{label:string;value:ReactNode;hint:string;icon:IconName;tone?:'green'|'amber'|'red'|'blue'}){
 return <div className={`metric metric-${tone}`}><div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon name={icon}/></span></div><strong>{value}</strong><small>{hint}</small></div>;
}
