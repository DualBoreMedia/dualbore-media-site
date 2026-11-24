import test from 'node:test';
import assert from 'node:assert/strict';
import {saveTextRecovery,readTextRecovery,clearTextRecovery,clearOwnerTextRecoveries,TEXT_RECOVERY_AGE_MS} from '../src/operations/draft-recovery.js';
const storage=()=>{const map=new Map();return {get length(){return map.size;},key:i=>[...map.keys()][i]??null,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k),entries:()=>[...map.entries()]};};
const args={ownerId:'user_qaowner',editor:'merch',productId:'new',expectedVersion:null};
const text={name:'Original garage artwork',description:'Work in progress. No public listing.'};

test('only bounded, allowed text is written to a versioned owner-scoped session record',()=>{
 const s=storage();assert.equal(saveTextRecovery({...args,text,storage:s,now:10}),true);
 const [key,value]=s.entries()[0];
 assert.match(key,/user_qaowner:merch:new/);
 assert.deepEqual(JSON.parse(value),{format:1,expectedVersion:null,createdAt:10,...text});
 assert.ok(!value.includes('token')&&!value.includes('fileBytes'));
 assert.deepEqual(readTextRecovery({...args,storage:s,now:11}),text);
 assert.equal(readTextRecovery({...args,ownerId:'user_other',storage:s,now:11}),null);
 assert.equal(readTextRecovery({...args,editor:'mx_setup',storage:s,now:11}),null);
 assert.equal(clearTextRecovery({...args,storage:s}),true);
 assert.equal(s.length,0);
});
test('stale version or elapsed time never overrides a newly saved authoritative record',()=>{
 const s=storage();
 const initial={...args,productId:'product_1',expectedVersion:3,storage:s};
 assert.equal(saveTextRecovery({...initial,text,now:1000}),true);
 assert.equal(readTextRecovery({...initial,expectedVersion:4,now:1001}),null);
 assert.equal(s.length,0);
 saveTextRecovery({...initial,text,now:2000});
 assert.deepEqual(readTextRecovery({...initial,now:2000+TEXT_RECOVERY_AGE_MS}),text);
 assert.equal(readTextRecovery({...initial,now:2000+TEXT_RECOVERY_AGE_MS+1}),null);
 assert.equal(s.length,0);
});
test('reject malformed or untrusted recovery data and denied Storage without exceptions',()=>{
 const s=storage();
 for(const bad of [
 {ownerId:'../../owner'}, {ownerId:'user:owner'}, {productId:'new/../../key'},
 {editor:'secrets'}, {expectedVersion:-1},{text:{name:'a'.repeat(121),description:''}},
 {text:{name:'valid',description:'b'.repeat(3001)}}
 ])assert.equal(saveTextRecovery({...args,text,storage:s,...bad}),false);
 assert.equal(s.length,0);
 const denied={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');},removeItem(){throw Error('blocked');},get length(){throw Error('blocked');}};
 assert.equal(saveTextRecovery({...args,text,storage:denied}),false);
 assert.equal(readTextRecovery({...args,storage:denied}),null);
 assert.equal(clearOwnerTextRecoveries('user_qaowner',denied),0);
});
test('logout clears this owner only, leaving other owners drafts untouched',()=>{
 const s=storage();
 saveTextRecovery({...args,storage:s,text,now:10});
 saveTextRecovery({...args,ownerId:'user_other',storage:s,text,now:10});
 saveTextRecovery({...args,productId:'product_2',storage:s,text,now:10});
 assert.equal(clearOwnerTextRecoveries('user_qaowner',s),2);
 assert.equal(readTextRecovery({...args,ownerId:'user_other',storage:s,now:11})?.name,text.name);
 assert.equal(s.length,1);
});

test('maximal valid escaped text can be restored; serialized size is not the field length',()=>{
 const s=storage();
 const text={name:'"'.repeat(120),description:'\\\n'.repeat(1500)};
 assert.equal(saveTextRecovery({...args,text,storage:s,now:10}),true);
 assert.ok(s.entries()[0][1].length>4096);
 assert.deepEqual(readTextRecovery({...args,storage:s,now:11}),text);
 const worst={name:'\u0001'.repeat(120),description:'\u0001'.repeat(3000)};
 assert.equal(saveTextRecovery({...args,text:worst,storage:s,now:12}),true);
 assert.deepEqual(readTextRecovery({...args,storage:s,now:13}),worst);
});
test('corrupt or oversized serialized drafts are removed; invalid read clock cannot restore data',()=>{
 const s=storage();const text={name:'Test',description:''};
 saveTextRecovery({...args,text,storage:s,now:10});const [key,value]=s.entries()[0];
 assert.equal(readTextRecovery({...args,storage:s,now:NaN}),null);
 assert.equal(s.getItem(key),value);
 for(const raw of ['{broken','x'.repeat(20000)]){
  s.setItem(key,raw);assert.equal(readTextRecovery({...args,storage:s,now:11}),null);assert.equal(s.length,0);
 }
});
