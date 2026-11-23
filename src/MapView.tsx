import {useEffect,useRef} from 'react';import L from 'leaflet';import 'leaflet/dist/leaflet.css';

export interface Pt{
 id:string;
 lat:number;
 lng:number;
 color:string;
 label:string;
 small?:boolean;
 ring?:boolean;
 square?:boolean;
 highPriority?:boolean;
 onClick?:()=>void;
}

interface CircleArea{
 center:[number,number];
 radiusKm:number;
}

interface Props{
 points:Pt[];
 route?:[number,number][];
 pick?:[number,number]|null;
 onPick?:(lat:number,lng:number)=>void;
 circle?:CircleArea|null;
 height?:number;
}

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export default function MapView({points,route,pick,onPick,circle,height=380}:Props){
 const el=useRef<HTMLDivElement>(null);
 const map=useRef<L.Map|null>(null);
 const layer=useRef<L.LayerGroup|null>(null);
 const cb=useRef(onPick);
 cb.current=onPick;

 useEffect(()=>{
  const m=L.map(el.current!).setView([12.9716,77.5946],13);

  L.tileLayer(TILE_URL,{
   attribution: ATTRIBUTION,
   maxZoom: 19
  }).addTo(m);

  layer.current=L.layerGroup().addTo(m);
  m.on('click',e=>cb.current?.(e.latlng.lat,e.latlng.lng));
  map.current=m;

  return()=>{
   m.remove();
  };
 },[]);

 useEffect(()=>{
  const g=layer.current!;
  g.clearLayers();

  if(circle){
   L.circle(circle.center,{
    radius:circle.radiusKm*1000,
    color:'#2b6cff',
    weight:2,
    fillColor:'#2b6cff',
    fillOpacity:0.07,
    dashArray:'4 6'
   }).addTo(g);
  }

  points.forEach(p=>{
   let marker:L.Layer;
   if(p.square){
    const s=p.small?10:14;
    const icon=L.divIcon({
     className:'bin-marker',
     html:`<div style="width:${s}px;height:${s}px;background:${p.color};border:2px solid #fff;border-radius:2px;box-shadow:0 1px 3px rgba(0,0,0,0.4);"></div>`,
     iconSize:[s,s],
     iconAnchor:[s/2,s/2]
    });
    marker=L.marker([p.lat,p.lng],{icon});
   }else if(p.ring){
    marker=L.circleMarker([p.lat,p.lng],{
     radius:p.small?8:12,
     color:p.color,
     weight:4,
     fillColor:p.color,
     fillOpacity:0.2
    });
   }else if(p.highPriority){
    const s = p.small ? 22 : 28;
    const icon = L.divIcon({
     className:'map-pin-high-priority',
     html:`<div style="width:${s}px;height:${s}px;border-radius:50%;background:${p.color};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:${p.small?11:14}px;line-height:1;user-select:none;">!</div>`,
     iconSize:[s,s],
     iconAnchor:[s/2,s/2]
    });
    marker=L.marker([p.lat,p.lng],{icon});
   }else{
    marker=L.circleMarker([p.lat,p.lng],{
     radius:p.small?7:10,
     color:'#fff',
     weight:3.5,
     fillColor:p.color,
     fillOpacity:1,
     className:'complaint-pin-marker'
    });
   }

   if(p.label){
    marker.bindTooltip(p.label,{direction:'top',offset:[0,-6]});
   }

   if(p.onClick){
    marker.on('click',(e)=>{
     L.DomEvent.stopPropagation(e);
     p.onClick?.();
    });
   }

   marker.addTo(g);
  });

  if(route&&route.length>1){
   L.polyline(route,{color:'#2b6cff',weight:4,dashArray:'2 8'}).addTo(g);
  }

  if(pick){
   L.circleMarker(pick,{radius:13,color:'#14233a',fillOpacity:0,weight:3}).addTo(g);
  }
 },[points,route,pick,circle]);

 useEffect(()=>{
  if(pick)map.current?.setView(pick,map.current.getZoom());
 },[pick]);

 return <div ref={el} style={{height,borderRadius:14,border:'2px solid var(--ink)'}} role="application" aria-label="Map"/>;
}
