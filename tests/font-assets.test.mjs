import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
test('public typography is bundled locally with redistribution licenses instead of third-party font downloads',async()=>{
 for(const path of ['index.html','dist/client/index.html'])assert.doesNotMatch(await readFile(path,'utf8'),/fonts\.(?:googleapis|gstatic)\.com/);
 const bundle='dist/client/_vite';
 const files=await readdir(bundle);
 assert.ok((await readdir('dist/client/assets')).includes('channel-logo.jpg'),'unversioned channel assets must remain separate from hashed build output');
 for(const family of ['teko','inter']){
  assert.ok(files.some(name=>name.startsWith(family+'-latin-')&&name.endsWith('.woff2')),family+' local font missing');
  assert.match(await readFile('dist/client/licenses/'+family+'-OFL.txt','utf8'),/SIL OPEN FONT LICENSE/i);
 }
 for(const name of files.filter(name=>name.endsWith('.css')))assert.doesNotMatch(await readFile(bundle+'/'+name,'utf8'),/fonts\.(?:googleapis|gstatic)\.com/);
});
