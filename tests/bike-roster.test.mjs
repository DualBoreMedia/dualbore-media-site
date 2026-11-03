import test from 'node:test';
import assert from 'node:assert/strict';
import {BIKE_PLACEHOLDERS,filterBikePlaceholders} from '../src/setups/bike-roster.js';
import {SETUP_CATALOG} from '../src/setups/catalog.js';

test('the complete reference roster contains unique placeholders and never adds verified inventory',()=>{
 assert.equal(BIKE_PLACEHOLDERS.length,53);
 assert.equal(new Set(BIKE_PLACEHOLDERS.map(b=>b.id)).size,53);
 assert.ok(BIKE_PLACEHOLDERS.every(b=>b.status==='placeholder'&&!b.file&&!b.downloadUrl&&!b.stripePriceId));
 assert.deepEqual(SETUP_CATALOG,[]);
 assert.ok(BIKE_PLACEHOLDERS.some(b=>b.name==='2025 Fantic XXF 250'));
 assert.ok(BIKE_PLACEHOLDERS.some(b=>b.name==='2023 Husqvarna TC 125'));
});
test('bike placeholders filter by manufacturer and compact model names together',()=>{
 assert.equal(filterBikePlaceholders({query:'TC125'})[0].name,'2023 Husqvarna TC 125');
 assert.equal(filterBikePlaceholders({brand:'Honda'}).length,6);
 assert.equal(filterBikePlaceholders({query:'CR250 1997',brand:'Honda'})[0].year,1997);
 assert.equal(filterBikePlaceholders({query:'TC125',brand:'Honda'}).length,0);
 assert.equal(filterBikePlaceholders({query:'not a bike'}).length,0);
 assert.equal(filterBikePlaceholders().length,53);
});
