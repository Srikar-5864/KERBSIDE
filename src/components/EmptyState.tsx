import {ReactNode} from 'react';
import Icon,{IconName} from './Icon';
export default function EmptyState({title,message,icon='reports',children}:{title:string;message:string;icon?:IconName;children?:ReactNode}){
 return <div className="empty-state"><span className="empty-state-icon"><Icon name={icon} size={26}/></span><h3>{title}</h3><p>{message}</p>{children}</div>;
}
