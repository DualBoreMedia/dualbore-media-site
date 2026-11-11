import {randomUUID} from 'node:crypto';
import {inspectReceivedStp} from './received.mjs';

const assetId = /^[a-f0-9-]{36}$/i;
function metadataFor(bytes,{filename,actor,createdAt}={}){
 const inspected=inspectSetupUpload(bytes,filename);
 if(typeof actor!=='string'||!actor||actor.length>200||!Number.isFinite(Date.parse(createdAt)))throw new Error('Verified upload actor and timestamp are required.');
 return {id:randomUUID(),...inspected,uploadedBy:actor,createdAt};
}
export function inspectSetupUpload(bytes, filename) {
  if (typeof filename !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9 ._()-]{0,119}\.stp$/i.test(filename)) {
    throw new Error('Choose a setup file with a simple .stp filename.');
  }
  return {...inspectReceivedStp(bytes), filename};
}

// Constructed with the repository's current transaction client. Asset creation,
// product attachment and immutable audit therefore commit or roll back together.
// No bulk-read method is provided and normal catalog reads never load payloads.
export function transactionSetupAssets(client) {
  return {
    async put(bytes, {filename, actor, createdAt} = {}) {
      const metadata = metadataFor(bytes,{filename,actor,createdAt});
      const result = await client.query(
        'INSERT INTO private_setup_assets (id,sha256,size_bytes,metadata,payload) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (sha256) DO NOTHING RETURNING metadata',
        [metadata.id, metadata.sha256, metadata.sizeBytes, metadata, Buffer.from(bytes)],
      );
      if (result.rows[0]) return structuredClone(result.rows[0].metadata);
      const existing = await client.query('SELECT metadata FROM private_setup_assets WHERE sha256=$1', [metadata.sha256]);
      if (!existing.rows[0]) throw new Error('Setup upload needs reconciliation.');
      return structuredClone(existing.rows[0].metadata);
    },
    async metadata(id) {
      if (!assetId.test(id || '')) return null;
      const result = await client.query('SELECT metadata FROM private_setup_assets WHERE id=$1', [id]);
      return result.rows[0] ? structuredClone(result.rows[0].metadata) : null;
    },
    async read(id) {
      if (!assetId.test(id || '')) return null;
      const result = await client.query('SELECT metadata,payload FROM private_setup_assets WHERE id=$1', [id]);
      if (!result.rows[0]) return null;
      const row = result.rows[0], bytes = new Uint8Array(row.payload);
      const inspected = inspectReceivedStp(bytes);
      if (inspected.sha256 !== row.metadata.sha256 || inspected.embeddedBikeId !== row.metadata.embeddedBikeId
          || inspected.sizeBytes !== row.metadata.sizeBytes) throw new Error('Setup file integrity check failed.');
      return {metadata:structuredClone(row.metadata), bytes};
    },
  };
}

// Transaction-local test storage, never used by production runtime.
export function memorySetupAssets(versions){
 return {
  async put(bytes,details){const metadata=metadataFor(bytes,details);const existing=[...versions.values()].find(row=>row.metadata.sha256===metadata.sha256);if(existing)return structuredClone(existing.metadata);versions.set(metadata.id,{metadata,bytes:new Uint8Array(bytes)});return structuredClone(metadata);},
  async metadata(id){return structuredClone(versions.get(id)?.metadata||null);},
  async read(id){return structuredClone(versions.get(id)||null);},
 };
}
