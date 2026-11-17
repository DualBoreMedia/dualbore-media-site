// Display-only planned garment choices for supplied legacy artwork. These are not SKUs.
const originalArtworkIds=new Set(['e92-tee','e90-crewneck','sv1000s-silhouette']);
export const plannedGarments=Object.freeze([
 Object.freeze({id:'tee',label:'T-shirt',category:'tees'}),
 Object.freeze({id:'crewneck',label:'Crewneck',category:'crewnecks'}),
 Object.freeze({id:'sweatshirt',label:'Sweatshirt',category:'sweatshirts'})
]);
export function optionsForArtwork(item){return item&&!item.managed&&originalArtworkIds.has(item.id)?plannedGarments:[];}
export function describeGarmentPreview(item,id){
 const selected=optionsForArtwork(item).find(o=>o.id===id);if(!selected)return null;
 const original=plannedGarments.find(o=>o.category===item.category);
 if(selected.id===original?.id)return {label:selected.label,pictured:true,price:item.previewPrice,
  message:'The image shows the original supplied '+selected.label+' mockup. The price is a plan, not an open offer.'};
 return {label:selected.label,pictured:false,price:null,
  message:selected.label+' is a planned option for this artwork. Its garment photo, fit details and price are not approved. The image still shows the original '+(original?.label||'garment')+' mockup.'};
}
