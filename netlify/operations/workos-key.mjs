// WorkOS scopes API keys to environments. Its documented sk_ prefix does not
// independently identify production, so opaque keys need verified environment
// evidence. Preserve previously supported live-form keys without admitting test
// keys, whitespace or arbitrary unclassified credentials.
export function productionWorkosKey(env){
 if(env.WORKOS_ENVIRONMENT!=='production')return false;
 const key=env.WORKOS_API_KEY;
 if(typeof key!=='string'||key.trim()!==key)return false;
 if(/^sk_live_[A-Za-z0-9]+$/.test(key))return true;
 if(/^sk_(?:test|staging|example)_/.test(key))return false;
 return /^sk_[A-Za-z0-9_-]+$/.test(key)&&env.WORKOS_PRODUCTION_VERIFIED==='true';
}
