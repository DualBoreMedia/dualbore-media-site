import {BIKE_PLACEHOLDERS} from './bike-roster.js';
export const compactBike=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function canonicalBike(product){
 return BIKE_PLACEHOLDERS.find(b=>b.id===product.bikeId||(!product.bikeId&&b.name===product.oemBike));
}
export function fileMatchesBike(embedded,bike){
 const match=/^MX[12]OEM_(\d{4})_(.+)$/.exec(embedded||'');
 return !!match&&Number(match[1])===bike.year&&compactBike(match[2])===compactBike(bike.brand+ bike.model);
}
export function setupIdentity(product){
 const bike=canonicalBike(product);
 return bike&&['MX','SX','track'].includes(product.discipline)&&(product.discipline!=='track'||product.track?.trim())
  ?[bike.id,product.discipline,product.discipline==='track'?compactBike(product.track):'general'].join(':'):null;
}
export function setupStage(row){
 if(row.setupFile&&row.draft.compatibility==='verified'&&row.draft.bikeVersion&&row.draft.gameVersion)return 'Verified';
 if(row.setupFile&&row.draft.compatibility==='testing')return 'Testing';
 return row.setupFile?'File received':'Draft';
}
