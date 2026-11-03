export function listingProduct(p){return {...p,detail:p.description,notes:p.description,type:p.category,image:p.images[0],previewPrice:p.priceCents/100,managed:true,testVariantsEnabled:false};}
