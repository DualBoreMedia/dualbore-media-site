import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {protectSourceMaps} from '../scripts/protect-source-maps.mjs';
test('build removes maps from public output but keeps private release evidence explicitly unverified',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'dbm-source-maps-'));
 try{
  const assets=path.join(root,'dist/client/assets');await mkdir(assets,{recursive:true});await writeFile(path.join(assets,'app.js'),'application');await writeFile(path.join(assets,'app.js.map'),'private sources');
  const evidence=await protectSourceMaps(root,{release:'abc1234'});assert.equal(evidence.privateSourceMapFiles,1);assert.equal(evidence.monitoringDeliveryVerified,false);assert.equal(evidence.sourceMapsResolved,false);
  assert.deepEqual(await readdir(assets),['app.js']);assert.equal(await readFile(path.join(root,'.tools/private-sourcemaps/abc1234/assets/app.js.map'),'utf8'),'private sources');
  await assert.rejects(protectSourceMaps(root,{release:'../../private'}),/Invalid/);
 }finally{await rm(root,{recursive:true,force:true});}
});
