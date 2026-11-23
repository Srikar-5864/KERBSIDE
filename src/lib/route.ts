type P={lat:number;lng:number};
export function km(a:[number,number],b:[number,number]){const r=(x:number)=>x*Math.PI/180,dl=r(b[0]-a[0]),dn=r(b[1]-a[1]);
 const h=Math.sin(dl/2)**2+Math.cos(r(a[0]))*Math.cos(r(b[0]))*Math.sin(dn/2)**2;return 12742*Math.asin(Math.sqrt(h))}
// Nearest-neighbour ordering from a start point.
export function orderRoute<T extends P>(start:[number,number],items:T[]):T[]{
 const left=[...items],out:T[]=[];let cur=start;
 while(left.length){let bi=0,bd=Infinity;left.forEach((p,i)=>{const d=km(cur,[p.lat,p.lng]);if(d<bd){bd=d;bi=i}});const n=left.splice(bi,1)[0];out.push(n);cur=[n.lat,n.lng]}
 return out}

// Priority-first ordering: High -> Medium -> Low, with nearest-neighbour within each priority.
export function orderPrioritizedRoute<T extends P & {priority:'low'|'medium'|'high'}>(start:[number,number],items:T[]):T[]{
 const high=items.filter(i=>i.priority==='high');
 const medium=items.filter(i=>i.priority==='medium');
 const low=items.filter(i=>i.priority==='low');

 const orderedHigh=orderRoute(start,high);
 const startMedium=orderedHigh.length>0?[orderedHigh[orderedHigh.length-1].lat,orderedHigh[orderedHigh.length-1].lng] as [number,number]:start;
 const orderedMedium=orderRoute(startMedium,medium);
 const startLow=orderedMedium.length>0?[orderedMedium[orderedMedium.length-1].lat,orderedMedium[orderedMedium.length-1].lng] as [number,number]:startMedium;
 const orderedLow=orderRoute(startLow,low);

 return [...orderedHigh,...orderedMedium,...orderedLow];
}
