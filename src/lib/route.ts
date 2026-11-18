type P={lat:number;lng:number};
export function km(a:[number,number],b:[number,number]){const r=(x:number)=>x*Math.PI/180,dl=r(b[0]-a[0]),dn=r(b[1]-a[1]);
 const h=Math.sin(dl/2)**2+Math.cos(r(a[0]))*Math.cos(r(b[0]))*Math.sin(dn/2)**2;return 12742*Math.asin(Math.sqrt(h))}
// Nearest-neighbour ordering from a start point.
export function orderRoute<T extends P>(start:[number,number],items:T[]):T[]{
 const left=[...items],out:T[]=[];let cur=start;
 while(left.length){let bi=0,bd=Infinity;left.forEach((p,i)=>{const d=km(cur,[p.lat,p.lng]);if(d<bd){bd=d;bi=i}});const n=left.splice(bi,1)[0];out.push(n);cur=[n.lat,n.lng]}
 return out}
