import test from 'node:test';
import assert from 'node:assert/strict';
import {RECEIVED_SETUP_DRAFTS, EXPECTED_MX2OEM_BIKE_ID, inspectReceivedStp, verifyReceivedStp} from '../netlify/setups/received.mjs';

function sampleBytes(bike = EXPECTED_MX2OEM_BIKE_ID) {
  const raw = Buffer.alloc(244);
  Buffer.from('c85393451601','hex').copy(raw,0);
  raw.write(bike,6,'ascii');
  return raw;
}

test('all received drafts retain expected hashes and fail-closed fulfillment status', () => {
  assert.equal(RECEIVED_SETUP_DRAFTS.length,3);
  assert.deepEqual(RECEIVED_SETUP_DRAFTS.map(item=>item.filename),['Supercross.stp','ASSEN.stp','Maryland.stp']);
  assert.equal(new Set(RECEIVED_SETUP_DRAFTS.map(item=>item.sha256)).size,3);
  assert.ok(RECEIVED_SETUP_DRAFTS.every(item=>item.embeddedBikeId===EXPECTED_MX2OEM_BIKE_ID));
  assert.ok(RECEIVED_SETUP_DRAFTS.every(item=>item.sizeBytes===244 && /^[a-f0-9]{64}$/.test(item.sha256)));
  assert.ok(RECEIVED_SETUP_DRAFTS.every(item=>item.published===false && item.tested===false && item.fileVerified===false && item.deliveryReady===false && item.privateAssetId===null));
});

test('observed STP header identifies bike and computes deterministic file integrity', () => {
  const sample=sampleBytes();
  const a=inspectReceivedStp(sample);
  const b=inspectReceivedStp(sample);
  assert.equal(a.embeddedBikeId,EXPECTED_MX2OEM_BIKE_ID);
  assert.equal(a.sizeBytes,244);
  assert.equal(a.sha256,b.sha256);
  assert.throws(()=>verifyReceivedStp(sample,RECEIVED_SETUP_DRAFTS[0]),/does not match/);
});

test('verification rejects altered, unrecognized and mismatched setup data', () => {
  const bytes=sampleBytes();
  assert.throws(()=>inspectReceivedStp(new Uint8Array(2)),/Unsupported/);
  assert.throws(()=>inspectReceivedStp({}),/Unsupported/);
  assert.throws(()=>inspectReceivedStp(Buffer.alloc(2*1024*1024+1)),/Unsupported/);
  const invalid=Buffer.from(bytes);invalid[0]^=1;
  assert.throws(()=>inspectReceivedStp(invalid),/signature/);
  const empty=Buffer.from(bytes);empty.fill(0,6,45);
  assert.throws(()=>inspectReceivedStp(empty),/identifier/);
  const corrupt=Buffer.from(bytes);corrupt.fill(65,6);
  assert.throws(()=>inspectReceivedStp(corrupt),/identifier/);
  const other=sampleBytes('OTHER_2023_BIKE');
  assert.throws(()=>inspectReceivedStp(other),/identifier/);
  assert.throws(()=>verifyReceivedStp(bytes,{}),/Unknown submission/);
  assert.throws(()=>verifyReceivedStp(bytes,null),/Unknown submission/);
});
