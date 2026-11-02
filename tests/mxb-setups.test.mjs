import test from 'node:test';
import assert from 'node:assert/strict';
import {PLANNED_PREVIEWS, SETUP_CATALOG, SETUP_TYPES, filterSetupListings, setupPriceCents} from '../src/setups/catalog.js';
import {preparePublicSetupCatalog} from '../netlify/setups/manifest.mjs';

const verified = {
  id: 'synthetic-bike-forest', bikeId: 'synthetic-bike', bikeName: 'Synthetic Test Bike',
  kind: 'track', trackId: 'forest', trackName: 'Forest', oemVersion: 'v0.19.1',
  gameVersion: 'Beta21e', privateAssetId: 'test-private-blob', fileSha256: 'a'.repeat(64),
  published: true, tested: true, fileVerified: true, deliveryReady: true,
};

test('setup previews are not inventory and prices are fixed by kind', () => {
  assert.equal(SETUP_CATALOG.length, 0);
  assert.equal(PLANNED_PREVIEWS.length, 5);
  assert.equal(setupPriceCents('track'), 100);
  assert.equal(setupPriceCents('general-mx'), 200);
  assert.equal(setupPriceCents('general-sx'), 200);
  assert.equal(setupPriceCents('unknown'), null);
  assert.equal(Object.keys(SETUP_TYPES).length, 3);
});

test('finder filters plans by text, type and track without inventing bikes', () => {
  assert.deepEqual(filterSetupListings(PLANNED_PREVIEWS, {query:'FOREST'}).map(x=>x.id), ['track-forest']);
  assert.deepEqual(filterSetupListings(PLANNED_PREVIEWS, {kind:'general-sx'}).map(x=>x.id), ['general-sx']);
  assert.deepEqual(filterSetupListings(PLANNED_PREVIEWS, {track:'mxb-club'}).map(x=>x.id), ['track-mxb-club']);
  assert.deepEqual(filterSetupListings(PLANNED_PREVIEWS, {bike:'unlisted'}), []);
});

test('manifest never exposes private assets, URLs or client-provided prices', () => {
  const result=preparePublicSetupCatalog([{...verified, priceCents:1, publicUrl:'https://example.invalid/private'}]);
  assert.equal(result.length, 1);
  assert.deepEqual(Object.keys(result[0]).sort(), ['bikeId','bikeName','gameVersion','id','kind','name','oemVersion','priceCents','trackId','trackName'].sort());
  assert.equal(result[0].priceCents, 100);
  assert.equal(JSON.stringify(result).includes('private'), false);
  assert.equal(JSON.stringify(result).includes('example.invalid'), false);
});

test('manifest blocks untested, missing-file, inconsistent or duplicate published products', () => {
  for (const patch of [
    {tested:false},{fileVerified:false},{deliveryReady:false},{privateAssetId:null},
    {fileSha256:'bad'},{oemVersion:'bad version'},{trackId:null},{kind:'nope'},
  ]) assert.throws(()=>preparePublicSetupCatalog([{...verified,...patch}]));
  assert.throws(()=>preparePublicSetupCatalog([verified,{...verified,id:'other-id'}]), /Duplicate/);
  assert.throws(()=>preparePublicSetupCatalog([verified,verified]), /Duplicate/);
  assert.deepEqual(preparePublicSetupCatalog([{...verified,published:false,fileVerified:false}]), []);
  assert.deepEqual(preparePublicSetupCatalog([]), []);
});

test('general product must omit a track and publish with its $2 fixed price', () => {
  const result=preparePublicSetupCatalog([{...verified,id:'synthetic-bike-general-mx',kind:'general-mx',trackId:null,trackName:null}]);
  assert.equal(result[0].priceCents, 200);
  assert.equal(result[0].trackId, null);
  assert.throws(()=>preparePublicSetupCatalog([{...verified,id:'synthetic-bike-general-mx',kind:'general-mx'}]), /Invalid track/);
});
