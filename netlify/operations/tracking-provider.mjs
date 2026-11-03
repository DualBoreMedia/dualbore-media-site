// Provider events must be verified by a server adapter before reaching this boundary.
// Manual entry is the only enabled provider. No polling or paid provider is configured.
export const manualTrackingProvider=Object.freeze({
 name:'manual',
 async lookup(){return {status:'unknown',source:'manual',description:'Use the carrier link for current tracking.'};},
});
export function trackingProvider(name='manual'){
 if(name!=='manual')throw new Error('Tracking provider is not configured.');
 return manualTrackingProvider;
}
