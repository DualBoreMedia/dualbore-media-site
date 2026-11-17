import test from 'node:test';
import assert from 'node:assert/strict';
import {merch} from '../src/content.js';
import {describeGarmentPreview,optionsForArtwork,plannedGarments} from '../src/commerce/garment-plans.js';

test('all three original artworks have three display-only garment options',()=>{
 assert.equal(merch.length,3);
 assert.deepEqual(plannedGarments.map(x=>x.label),['T-shirt','Crewneck','Sweatshirt']);
 for(const item of merch){
  assert.equal(optionsForArtwork(item).length,3);
  for(const plan of plannedGarments){
   const selected=describeGarmentPreview(item,plan.id);
   assert.equal(selected.pictured,plan.category===item.category);
   assert.equal(selected.price,plan.category===item.category?item.previewPrice:null);
  }
 }
});
test('managed or unknown artwork never receives invented garment plans',()=>{
 assert.deepEqual(optionsForArtwork({...merch[0],managed:true}),[]);
 assert.deepEqual(optionsForArtwork({...merch[0],id:'unknown'}),[]);
 assert.deepEqual(optionsForArtwork(null),[]);
 assert.equal(describeGarmentPreview(merch[0],'fake'),null);
});
