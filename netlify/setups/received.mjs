// Source-of-truth checksum ledger for files shared privately by the owner in chat.
// File bytes are deliberately not committed to public GitHub, shipped to the client,
// copied to Netlify, or made downloadable by this module.
import {createHash} from 'node:crypto';

export const EXPECTED_MX2OEM_BIKE_ID = 'MX2OEM_2023_Husqvarna_TC_125';
const header = Buffer.from('c85393451601', 'hex');
const bikePattern = /^MX2OEM_[A-Za-z0-9_]{1,60}$/;

export const RECEIVED_SETUP_DRAFTS = Object.freeze([
  Object.freeze({
    id: 'mx2oem-2023-husqvarna-tc-125-general-sx', filename: 'Supercross.stp', bikeId: 'mx2oem-2023-husqvarna-tc-125',
    embeddedBikeId: EXPECTED_MX2OEM_BIKE_ID, kind: 'general-sx',
    trackId: null, trackName: null,
    sizeBytes: 244, sha256: 'a9ca360a2e99d5f09a5b3bf3ec22b02c522a4b3788cb14ab22aa57f34117010f',
    published: false, tested: false, fileVerified: false, deliveryReady: false,
    privateAssetId: null, oemVersion: null, gameVersion: null,
  }),
  Object.freeze({
    id: 'mx2oem-2023-husqvarna-tc-125-assen', filename: 'ASSEN.stp', bikeId: 'mx2oem-2023-husqvarna-tc-125',
    embeddedBikeId: EXPECTED_MX2OEM_BIKE_ID, kind: 'track',
    trackId: 'assen', trackName: 'Assen',
    sizeBytes: 244, sha256: '3ff595be4d77be611b89dc46f0b00ca217485a96507f35e12cf0d5a1522aa1f0',
    published: false, tested: false, fileVerified: false, deliveryReady: false,
    privateAssetId: null, oemVersion: null, gameVersion: null,
  }),
  Object.freeze({
    id: 'mx2oem-2023-husqvarna-tc-125-maryland', filename: 'Maryland.stp', bikeId: 'mx2oem-2023-husqvarna-tc-125',
    embeddedBikeId: EXPECTED_MX2OEM_BIKE_ID, kind: 'track',
    trackId: 'maryland', trackName: 'Maryland',
    sizeBytes: 244, sha256: 'd36dc00054e3afe6dfedcffe822189e09949cc7bff20e786cd920a7dee3e600a',
    published: false, tested: false, fileVerified: false, deliveryReady: false,
    privateAssetId: null, oemVersion: null, gameVersion: null,
  })
]);

// This validates the observed structure of THESE three submitted files, not all
// versions of the MX Bikes .stp file format or their behavior in the game.
export function inspectReceivedStp(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 48 || bytes.byteLength > 2 * 1024 * 1024) {
    throw new Error('Unsupported setup attachment.');
  }
  const data = Buffer.from(bytes);
  if (!data.subarray(0, header.length).equals(header)) throw new Error('Unknown setup file signature.');
  const end = data.indexOf(0, header.length);
  if (end < 0 || end - header.length > 68) throw new Error('Malformed embedded bike identifier.');
  const bikeId = data.subarray(header.length, end).toString('ascii');
  if (!bikePattern.test(bikeId)) throw new Error('Invalid embedded bike identifier.');
  return Object.freeze({
    embeddedBikeId: bikeId, sizeBytes: data.byteLength,
    sha256: createHash('sha256').update(data).digest('hex'),
  });
}

export function verifyReceivedStp(bytes, draft) {
  if (!draft || !RECEIVED_SETUP_DRAFTS.includes(draft)) throw new Error('Unknown submission draft.');
  const result = inspectReceivedStp(bytes);
  if (result.embeddedBikeId !== draft.embeddedBikeId
    || result.sizeBytes !== draft.sizeBytes || result.sha256 !== draft.sha256) {
    throw new Error('Setup file does not match the staged draft.');
  }
  return result;
}
