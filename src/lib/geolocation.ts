import {km} from './route';
export const CLEARANCE_RADIUS_METRES=100;
export interface CleanupLocation{lat:number;lng:number;accuracy:number;capturedAt:string}
export function validateCleanupLocation(location:CleanupLocation,target:{lat:number;lng:number}){
 if(!Number.isFinite(location.lat)||!Number.isFinite(location.lng)||Math.abs(location.lat)>90||Math.abs(location.lng)>180
  ||!Number.isFinite(location.accuracy)||location.accuracy<0||location.accuracy>100)throw new Error('GPS accuracy is too low. Move into an open area and try again (within 100 metres accuracy).');
 if(km([target.lat,target.lng],[location.lat,location.lng])*1000>CLEARANCE_RADIUS_METRES)throw new Error('Move within 100 metres of the report pin before recording cleanup.');
}
function locationFromPosition(position:GeolocationPosition,target:{lat:number;lng:number}):CleanupLocation{
 if(Math.abs(Date.now()-position.timestamp)>30000)throw new Error('The GPS reading is stale. Please capture your location again.');
 const location={lat:position.coords.latitude,lng:position.coords.longitude,accuracy:position.coords.accuracy,capturedAt:new Date(position.timestamp).toISOString()};
 validateCleanupLocation(location,target);return location;
}
export function captureCleanupLocation(target:{lat:number;lng:number},recentPosition:GeolocationPosition|null=null):Promise<CleanupLocation>{
 if(recentPosition){
  try{return Promise.resolve(locationFromPosition(recentPosition,target))}catch{/* An unusable live fix needs a new reading. */}
 }
 return new Promise((resolve,reject)=>{
  if(!navigator.geolocation)return reject(new Error('GPS is unavailable on this device.'));
  const success=(position:GeolocationPosition)=>{try{resolve(locationFromPosition(position,target))}catch(e){reject(e)}};
  const failure=(error:GeolocationPositionError)=>reject(new Error(error.code===1?'Allow location access to record cleanup.':error.code===3?'GPS timed out. Check device location services and try again in an open area.':'GPS is unavailable. Wait for a location fix at the cleanup site; supported devices can acquire one offline.'));
  navigator.geolocation.getCurrentPosition(success,error=>{
   if(error.code===1){failure(error);return}
   // Wi-Fi/network positioning can still provide a valid fix when satellite GPS stalls.
   navigator.geolocation.getCurrentPosition(success,failure,{enableHighAccuracy:false,maximumAge:30000,timeout:15000});
  },{enableHighAccuracy:true,maximumAge:30000,timeout:45000});
 });
}
