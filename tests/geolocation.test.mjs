import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {createServer} from 'vite';
const server=await createServer({server:{middlewareMode:true,hmr:{port:30000+process.pid%30000}}});
after(()=>server.close());
const {validateCleanupLocation,captureCleanupLocation}=await server.ssrLoadModule('/src/lib/geolocation.ts');
const target={lat:12.9716,lng:77.5946};
const position={...target,accuracy:10,capturedAt:new Date().toISOString()};
test('GPS permits accurate in-range capture and rejects distant locations',()=>{
 assert.doesNotThrow(()=>validateCleanupLocation(position,target));
 assert.doesNotThrow(()=>validateCleanupLocation({...position,lat:target.lat+0.0008},target));
 assert.throws(()=>validateCleanupLocation({...position,lat:target.lat+0.001},target),/within 100 metres/);
});
test('GPS rejects poor accuracy, invalid coordinates and non-finite values',()=>{
 for(const patch of [{accuracy:101},{accuracy:-1},{accuracy:NaN},{lat:NaN},{lng:Infinity},{lat:91},{lng:-181}]){
  assert.throws(()=>validateCleanupLocation({...position,...patch},target),/GPS accuracy/);
 }
});
test('offline capture uses a fresh high-accuracy GPS reading',async()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 let options;
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:false,geolocation:{getCurrentPosition(success,_error,config){options=config;success({coords:{latitude:target.lat,longitude:target.lng,accuracy:8},timestamp:Date.now()})}}}});
 try{
  const location=await captureCleanupLocation(target);
  assert.equal(location.lat,target.lat);assert.equal(location.accuracy,8);
  assert.equal(options.maximumAge,0);assert.equal(options.enableHighAccuracy,true);
  navigator.geolocation.getCurrentPosition=success=>success({coords:{latitude:target.lat,longitude:target.lng,accuracy:8},timestamp:Date.now()-60000});
  await assert.rejects(captureCleanupLocation(target),/stale/);
  navigator.geolocation.getCurrentPosition=(_success,error)=>error({code:1});
  await assert.rejects(captureCleanupLocation(target),/Allow location access/);
 }finally{if(original)Object.defineProperty(globalThis,'navigator',original);else delete globalThis.navigator}
});
