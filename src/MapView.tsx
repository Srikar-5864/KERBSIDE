import {useEffect,useRef} from 'react';import L from 'leaflet';import 'leaflet/dist/leaflet.css';
export interface Pt{id:string;lat:number;lng:number;color:string;label:string;small?:boolean}
interface Props{points:Pt[];route?:[number,number][];pick?:[number,number]|null;onPick?:(lat:number,lng:number)=>void;height?:number}
export default function MapView({points,route,pick,onPick,height=380}:Props){
 const el=useRef<HTMLDivElement>(null),map=useRef<L.Map|null>(null),layer=useRef<L.LayerGroup|null>(null),cb=useRef(onPick);cb.current=onPick;
 useEffect(()=>{const m=L.map(el.current!).setView([12.9716,77.5946],13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors'}).addTo(m);
  layer.current=L.layerGroup().addTo(m);m.on('click',e=>cb.current?.(e.latlng.lat,e.latlng.lng));map.current=m;return()=>{m.remove()}},[]);
 useEffect(()=>{const g=layer.current!;g.clearLayers();
  points.forEach(p=>L.circleMarker([p.lat,p.lng],{radius:p.small?6:9,color:'#fff',weight:2,fillColor:p.color,fillOpacity:1}).bindTooltip(p.label).addTo(g));
  if(route&&route.length>1)L.polyline(route,{color:'#2b6cff',weight:4,dashArray:'2 8'}).addTo(g);
  if(pick)L.circleMarker(pick,{radius:13,color:'#14233a',fillOpacity:0,weight:3}).addTo(g)},[points,route,pick]);
 useEffect(()=>{if(pick)map.current?.setView(pick,map.current.getZoom())},[pick]);
 return <div ref={el} style={{height,borderRadius:14,border:'2px solid var(--ink)'}} role="application" aria-label="Map"/>}
