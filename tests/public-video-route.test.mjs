import test from 'node:test';
import assert from 'node:assert/strict';
import {resolvePublicVideo} from '../src/public-video-route.js';

test('lowercased hosting paths recover only a unique verified public video ID', () => {
  const film = {id:'LOOSFHJGUPM'};
  assert.equal(resolvePublicVideo([film], 'loosfhjgupm'), film);
  assert.equal(resolvePublicVideo([film], film.id), film);
  assert.equal(resolvePublicVideo([film], 'unknown1234'), null);
  assert.equal(resolvePublicVideo([film], '../bad'), null);
  assert.equal(resolvePublicVideo([film], undefined), null);
  const collision = {id:'LoOSFHJGUPM'};
  assert.equal(resolvePublicVideo([film,collision], 'loosfhjgupm'), null);
  assert.equal(resolvePublicVideo([film,collision], collision.id), null);
  assert.equal(resolvePublicVideo([{id:'AAAAAAAAAAA'},{id:'aaaaaaaaaaa'}], 'aaaaaaaaaaa'), null);
});
