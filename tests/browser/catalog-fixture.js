// Explicit authoritative public-product fixture for tests whose subject is a
// different flow. Unknown/offline catalog responses must never imply this data.
export const withPublicCatalog=(handler=globalThis.fetch)=>async(url,options)=>url==='/api/products'
 ?Response.json({products:[],hiddenProductIds:[]})
 :handler(url,options);
