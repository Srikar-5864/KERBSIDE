import {km} from './route';
export const CLEARANCE_RADIUS_METRES=100;
export interface CleanupLocation{lat:number;lng:number;accuracy:number;capturedAt:string}
export function validateCleanupLocation(location:CleanupLocation,target:{lat:number;lng:number}){
 if(!Number.isFinite(location.lat)||!Number.isFinite(location.lng)||Math.abs(location.lat)>90||Math.abs(location.lng)>180
  ||!Number.isFinite(location.accuracy)||location.accuracy<0||location.accuracy>100)throw new Error('GPS accuracy is too low. Move into an open area and try again (within 100 metres accuracy).');
 if(km([target.lat,target.lng],[location.lat,location.lng])*1000>CLEARANCE_RADIUS_METRES)throw new Error('Move within 100 metres of the report pin before recording cleanup.');
}
export function captureCleanupLocation(target:{lat:number;lng:number}):Promise<CleanupLocation>{
 return new Promise((resolve,reject)=>{
  if(!navigator.geolocation)return reject(new Error('GPS is unavailable on this device.'));
  navigator.geolocation.getCurrentPosition(position=>{
   try{
    if(Math.abs(Date.now()-position.timestamp)>30000)throw new Error('The GPS reading is stale. Please capture your location again.');
    const location={lat:position.coords.latitude,lng:position.coords.longitude,accuracy:position.coords.accuracy,capturedAt:new Date(position.timestamp).toISOString()};
    validateCleanupLocation(location,target);resolve(location);
   }catch(e){reject(e)}
  },error=>reject(new Error(error.code===1?'Allow location access to record cleanup.':error.code===3?'GPS timed out. Move into an open area and try again.':'GPS is unavailable. Wait for a location fix at the cleanup site; supported devices can acquire one offline.')),
  {enableHighAccuracy:true,maximumAge:0,timeout:20000});
 });
}
