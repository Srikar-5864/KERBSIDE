import {defineConfig} from 'vite';import react from '@vitejs/plugin-react';
import {readFileSync} from 'node:fs';
export default defineConfig({plugins:[react(),{
 name:'offline-shell',
 generateBundle(_options,bundle){
  const assets=['/',...Object.keys(bundle).filter(name=>/\.(js|css)$/.test(name)).map(name=>`/${name}`)];
  const source=readFileSync(new URL('./src/service-worker.js',import.meta.url),'utf8').replace('__PRECACHE__',JSON.stringify(assets));
  this.emitFile({type:'asset',fileName:'sw.js',source});
 },
}]});
