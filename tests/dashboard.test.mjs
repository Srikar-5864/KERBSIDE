import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {StaticRouter} from 'react-router-dom/server.js';
import {createServer} from 'vite';

const originalNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:true}});
const server=await createServer({server:{middlewareMode:true,hmr:{port:30000+process.pid%30000}},plugins:[{
 name:'dashboard-fixtures',enforce:'pre',
 resolveId(id){
  if(id==='./auth'||id==='../auth')return '\0fixture-auth';
  if(id.endsWith('/MapView'))return '\0fixture-map';
  if(id.endsWith('/useComplaints'))return '\0fixture-reports';
 },
 load(id){
  if(id==='\0fixture-auth')return 'export const useAuth=()=>globalThis.dashboardAuth';
  if(id==='\0fixture-map')return 'export default function MapView(){return null}';
  if(id==='\0fixture-reports')return 'export const useComplaints=()=>({rows:[],load:async()=>{}})';
 },
}]});
after(async()=>{await server.close();delete globalThis.dashboardAuth;if(originalNavigator)Object.defineProperty(globalThis,'navigator',originalNavigator);else delete globalThis.navigator});
const {default:App}=await server.ssrLoadModule('/src/App.tsx');
function render(role,view=''){
 globalThis.dashboardAuth={session:{user:{id:'test-user'}},profile:{id:'test-user',name:'Ananya Rao',role,points:42},loading:false,refresh:async()=>{}};
 return renderToStaticMarkup(createElement(StaticRouter,{location:`/app${view?`?view=${view}`:''}`},createElement(App)));
}
test('each role gets its own dashboard navigation and default view',()=>{
 const resident=render('citizen'),crew=render('collector'),admin=render('admin');
 assert.match(resident,/Hello, Ananya/);assert.match(resident,/Report an issue/);
 assert.doesNotMatch(resident,/Team &amp; access/);
 assert.match(crew,/Your route, ready to go/);assert.match(crew,/Record cleanup|first cleanup|all caught up/);
 assert.doesNotMatch(crew,/Team &amp; access/);
 assert.match(admin,/A cleaner city starts here/);assert.match(admin,/Team &amp; access/);
 assert.match(admin,/aria-current="page"[^>]*><svg/);
});
test('citizen form and offline views are reachable through query navigation',()=>{
 const report=render('citizen','report'),saved=render('citizen','saved');
 assert.match(report,/What needs attention/);assert.match(report,/Pin the location/);
 assert.match(report,/id="citizen-photo-picker"/);assert.match(report,/Use my location/);
 assert.match(saved,/Everything is in sync/);
});
test('team management and collector history stay in dedicated views',()=>{
 const team=render('admin','team'),completed=render('collector','completed'),saved=render('collector','saved');
 assert.match(team,/Add a collector/);assert.match(team,/Workspace access/);
 assert.match(completed,/Good work, on the record/);assert.match(completed,/Your first cleanup is ahead/);
 assert.match(saved,/Saved cleanups \(0\)/);assert.match(saved,/Everything is in sync/);
});
test('unknown or other-role view parameters fall back to the role home',()=>{
 assert.match(render('citizen','team'),/Hello, Ananya/);
 assert.match(render('collector','missing-view'),/Your route, ready to go/);
});
