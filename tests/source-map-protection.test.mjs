import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,glob} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {protectSourceMaps} from '../scripts/protect-source-maps.mjs';
import viteConfig,{sentrySourceMapAssets} from '../vite.config.mjs';

test('Sentry upload discovers generated JavaScript with adjacent hidden maps before public-map removal',async()=>{
 const previous=process.env.SENTRY_UPLOAD_SOURCEMAPS;process.env.SENTRY_UPLOAD_SOURCEMAPS='false';
 let build;try{build=viteConfig({mode:'production'}).build;}finally{if(previous===undefined)delete process.env.SENTRY_UPLOAD_SOURCEMAPS;else process.env.SENTRY_UPLOAD_SOURCEMAPS=previous;}
 const root=await mkdtemp(path.join(tmpdir(),'dbm-source-map-upload-'));
 try{
  const generated=path.join(build.outDir,build.assetsDir),names=['index-abc123.js','chunks/lazy-def456.js'];
  for(const name of names){const file=path.join(root,generated,name);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,'application');await writeFile(file+'.map','private source map');}
  const unrelated=path.join(root,build.outDir,'assets');await mkdir(unrelated,{recursive:true});await writeFile(path.join(unrelated,'unrelated.js'),'public static file');
  const selected=(await Array.fromAsync(glob(sentrySourceMapAssets,{cwd:root}))).map(file=>file.replaceAll('\\','/')).sort();
  assert.deepEqual(selected,names.map(name=>path.join(generated,name).replaceAll('\\','/')).sort());
  for(const file of selected)assert.equal(await readFile(path.join(root,file)+'.map','utf8'),'private source map');
  const evidence=await protectSourceMaps(root,{release:'abc1234'});assert.equal(evidence.privateSourceMapFiles,2);
  for(const file of selected){assert.equal(await readFile(path.join(root,file),'utf8'),'application');await assert.rejects(readFile(path.join(root,file)+'.map'),{code:'ENOENT'});}
 }finally{await rm(root,{recursive:true,force:true});}
});
test('build removes maps from public output but keeps private release evidence explicitly unverified',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'dbm-source-maps-'));
 try{
  const assets=path.join(root,'dist/client/assets');await mkdir(assets,{recursive:true});await writeFile(path.join(assets,'app.js'),'application');await writeFile(path.join(assets,'app.js.map'),'private sources');
  const evidence=await protectSourceMaps(root,{release:'abc1234'});assert.equal(evidence.privateSourceMapFiles,1);assert.equal(evidence.monitoringDeliveryVerified,false);assert.equal(evidence.sourceMapsResolved,false);
  assert.deepEqual(await readdir(assets),['app.js']);assert.equal(await readFile(path.join(root,'.tools/private-sourcemaps/abc1234/assets/app.js.map'),'utf8'),'private sources');
  await assert.rejects(protectSourceMaps(root,{release:'../../private'}),/Invalid/);
 }finally{await rm(root,{recursive:true,force:true});}
});
