import { variants } from '../../src/commerce/catalog.js';
export const testCatalog=variants.map(v=>({id:v.id,productId:v.productId,sku:v.sku,size:v.size,name:({'e92-tee':'E92 Coupe Line-Art Tee','e90-crewneck':'E90 Sedan Front-Clip Crewneck','sv1000s-silhouette':'SV1000S Silhouette Crewneck'})[v.productId],active:true,priceCents:v.unitAmount,stripePriceId:null,availableQuantity:0,reservedQuantity:0,soldQuantity:0,testData:true}));
export async function seedTestCatalog(repository,{quantity=0}={}) {
 if(!Number.isInteger(quantity)||quantity<0||quantity>1000)throw new Error('Explicit test inventory must be 0 to 1000.');
 await repository.transaction(state=>{for(const v of testCatalog)if(!state.variants[v.id])state.variants[v.id]={...v,availableQuantity:quantity};});
}
