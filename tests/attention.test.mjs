import test from 'node:test';
import assert from 'node:assert/strict';
import {attentionQueue} from '../src/operations/attention.js';
test('attention groups repeated issues, prioritizes refunds/deadlines and retains independent issues',()=>{
 const failures=[{type:'email',status:'queued',orderNumber:'A',eventId:'one'},{type:'email',status:'queued',orderNumber:'A',eventId:'two'},{type:'fulfillment',orderNumber:'B'},{type:'shipment_delay',orderNumber:'B',status:'cancel_refund_due'},{type:'webhook',status:'failed',eventId:'event'},{type:'refund',orderNumber:'C',status:'review'},{type:'shipment_delay',orderNumber:'D',status:'awaiting_consent'},{type:'inventory',status:'review'},{type:'account',status:'review'},{type:'fulfillment',orderNumber:'E'}];
 const original=structuredClone(failures),result=attentionQueue(failures);
 assert.deepEqual(failures,original);assert.equal(result.length,8);assert.equal(result[0].orderNumber,'B');assert.equal(result[1].orderNumber,'C');assert.equal(result.at(-1).count,2);assert.equal(result.at(-1).eventId,'one');assert.ok(result.some(f=>f.orderNumber==='E'));assert.deepEqual(attentionQueue([]),[]);
});
