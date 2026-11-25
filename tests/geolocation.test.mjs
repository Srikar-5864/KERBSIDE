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
  assert.equal(options.maximumAge,30000);assert.equal(options.enableHighAccuracy,true);
  assert.equal(options.timeout,45000);
  navigator.geolocation.getCurrentPosition=success=>success({coords:{latitude:target.lat,longitude:target.lng,accuracy:8},timestamp:Date.now()-60000});
  await assert.rejects(captureCleanupLocation(target),/stale/);
  navigator.geolocation.getCurrentPosition=(_success,error)=>error({code:1});
  await assert.rejects(captureCleanupLocation(target),/Allow location access/);
 }finally{if(original)Object.defineProperty(globalThis,'navigator',original);else delete globalThis.navigator}
});

async function withGeolocation(getCurrentPosition,check){
 const original=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:false,geolocation:{getCurrentPosition}}});
 try{await check()}finally{if(original)Object.defineProperty(globalThis,'navigator',original);else delete globalThis.navigator}
}
function fix(patch={},age=0){
 return {coords:{latitude:target.lat,longitude:target.lng,accuracy:8,...patch},timestamp:Date.now()-age};
}
test('collector reuses an accurate recent live fix without requesting GPS again',async()=>{
 const live=fix({},15000);
 await withGeolocation(()=>assert.fail('a second GPS request should not be needed'),async()=>{
  const location=await captureCleanupLocation(target,live);
  assert.equal(location.lat,target.lat);
  assert.equal(location.capturedAt,new Date(live.timestamp).toISOString());
 });
});
test('stale, inaccurate, or distant live fixes require a new validated reading',async()=>{
 for(const recent of [fix({},60000),fix({accuracy:500}),fix({latitude:target.lat+0.01})]){
  let requests=0;
  await withGeolocation(success=>{requests++;success(fix())},async()=>{
   const location=await captureCleanupLocation(target,recent);
   assert.equal(requests,1);assert.equal(location.accuracy,8);
  });
 }
});
test('a GPS timeout or unavailable provider retries standard positioning once',async()=>{
 for(const code of [2,3]){
  const options=[];
  await withGeolocation((success,error,config)=>{
   options.push(config);
   if(options.length===1)error({code});else success(fix());
  },async()=>{
   const location=await captureCleanupLocation(target);
   assert.equal(location.lat,target.lat);
   assert.equal(options.length,2);
   assert.equal(options[0].enableHighAccuracy,true);
   assert.equal(options[1].enableHighAccuracy,false);
   assert.equal(options[0].timeout+options[1].timeout,60000);
  });
 }
});
test('fallback still rejects inaccurate, stale, and out-of-range locations',async()=>{
 for(const [fallback,message] of [[fix({accuracy:101}),/GPS accuracy/],[fix({latitude:target.lat+0.001}),/within 100 metres/],[fix({},60000),/stale/]]){
  let requests=0;
  await withGeolocation((success,error)=>{if(++requests===1)error({code:3});else success(fallback)},async()=>{
   await assert.rejects(captureCleanupLocation(target),message);
  });
 }
});
test('permission denial does not retry and repeated timeouts remain errors',async()=>{
 for(const [code,count,message] of [[1,1,/Allow location access/],[3,2,/GPS timed out/]]){
  let requests=0;
  await withGeolocation((_success,error)=>{requests++;error({code})},async()=>{
   await assert.rejects(captureCleanupLocation(target),message);assert.equal(requests,count);
  });
 }
});
