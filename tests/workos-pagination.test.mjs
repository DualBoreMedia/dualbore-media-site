import test from 'node:test';
import assert from 'node:assert/strict';
import {allWorkosPages} from '../netlify/operations/workos-pagination.mjs';

test('WorkOS follows opaque cursors beyond ten pages and validates completion', async () => {
  const calls=[];
  const rows=await allWorkosPages(async options=>{
    calls.push(options);const page=options.after?Number(options.after.slice(7)):0;
    return {data:[page],listMetadata:page<12?{after:'cursor-'+(page+1)}:{}};
  });
  assert.deepEqual(rows,Array.from({length:13},(_,index)=>index));
  assert.equal(calls[12].after,'cursor-12');assert.equal(calls.every(call=>call.limit===100),true);
});

test('WorkOS repeated cursors, malformed pages and provider errors never yield a complete result', async () => {
  await assert.rejects(allWorkosPages(async()=>({data:[],listMetadata:{after:'repeat'}})),/did not advance/);
  await assert.rejects(allWorkosPages(async()=>({data:null})),/Invalid WorkOS page/);
  await assert.rejects(allWorkosPages(async()=>({data:[],listMetadata:{after:123}})),/did not advance/);
  let calls=0;await assert.rejects(allWorkosPages(async()=>{if(++calls===3)throw Error('provider unavailable');return{data:[calls],listMetadata:{after:String(calls)}};}),/provider unavailable/);
  await assert.rejects(allWorkosPages(async({after})=>({data:[],listMetadata:{after:String(Number(after||0)+1)}})),/could not be completed safely/);
});
