import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequestKey} from '../src/operations/request-key.js';
const valid='01234567-89ab-4def-8123-456789abcdef';
const entropy={getRandomValues:bytes=>{for(let n=0;n<bytes.length;n++)bytes[n]=n;return bytes;}};
test('request keys use native UUID or cryptographic bytes with UUID version and variant',()=>{
 assert.equal(createRequestKey({randomUUID:()=>valid}),valid);
 assert.equal(createRequestKey(entropy),'00010203-0405-4607-8809-0a0b0c0d0e0f');
 assert.equal(createRequestKey({...entropy,randomUUID:()=>{throw Error('Unavailable');}}),'00010203-0405-4607-8809-0a0b0c0d0e0f');
 assert.equal(createRequestKey({...entropy,randomUUID:()=> 'invalid'}),'00010203-0405-4607-8809-0a0b0c0d0e0f');
});
test('request keys fail closed without secure entropy and never use Math.random',()=>{
 for(const api of [null,{}, {getRandomValues:()=>{throw Error('Unavailable');}}, {randomUUID:()=> 'invalid'}])assert.throws(()=>createRequestKey(api),/secure request.*Nothing was changed/);
});
