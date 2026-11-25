import assert from 'node:assert/strict';
import {after, test} from 'node:test';
import {createServer} from 'vite';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {StaticRouter} from 'react-router-dom/server.js';

// Render the real pages with controlled auth state; no emails or live accounts.
const server=await createServer({
 server:{middlewareMode:true,hmr:{port:30000+process.pid%30000}},
 plugins:[{
  name:'test-auth',enforce:'pre',
  resolveId(id){if(id==='../auth')return '\0test-auth'},
  load(id){if(id==='\0test-auth')return 'export const useAuth=()=>globalThis.testAuth'},
 }],
});
after(async()=>{await server.close();delete globalThis.window;delete globalThis.testAuth});
const {default:ResetPassword}=await server.ssrLoadModule('/src/pages/ResetPassword.tsx');
const {default:Login}=await server.ssrLoadModule('/src/pages/Login.tsx');
function render(Page,{session=null,loading=false,hash='',search=''}={}){
 globalThis.testAuth={session,loading};
 globalThis.window={location:{hash,search}};
 return renderToStaticMarkup(createElement(StaticRouter,{location:'/reset-password'},createElement(Page)));
}

test('sign-in offers password recovery and keeps normal sign-in fields',()=>{
 const html=render(Login);
 assert.match(html,/Forgot password\?/);
 assert.match(html,/autoComplete="current-password"/);
 assert.match(html,/New here\? Sign up/);
});
test('reset waits for session initialization before showing a form',()=>{
 const html=render(ResetPassword,{loading:true});
 assert.match(html,/Checking your reset link/);
 assert.doesNotMatch(html,/<form/);
});
test('reset without a session offers a new link instead of a password form',()=>{
 const html=render(ResetPassword);
 assert.match(html,/invalid or has expired/);
 assert.match(html,/href="\/login"/);
 assert.doesNotMatch(html,/<form/);
});
test('authenticated reset shows both required password fields',()=>{
 const html=render(ResetPassword,{session:{user:{id:'test-user'}}});
 assert.match(html,/name="password"/);
 assert.match(html,/name="confirm"/);
 assert.equal((html.match(/minLength="6"/g)||[]).length,2);
});
test('expired links cannot use an existing session to show the reset form',()=>{
 for(const params of [{hash:'#error_code=otp_expired'},{hash:'#error=access_denied'},{search:'?error=access_denied'},{search:'?error_code=otp_expired'},{hash:'#error_description=Expired'}]){
  const html=render(ResetPassword,{session:{user:{id:'test-user'}},...params});
  assert.match(html,/invalid or has expired/);
  assert.doesNotMatch(html,/<form/);
 }
});
