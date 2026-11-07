import {merch} from '../../src/content.js';
import {operationsRuntime} from '../operations/runtime.mjs';
import {publicProducts,publicSetupPreviews} from '../operations/products.mjs';
export async function productsHttp(request,{runtime=operationsRuntime,env=process.env}={}){
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 if(request.method!=='GET')return Response.json({error:'Use GET.'},{status:405,headers:{...headers,Allow:'GET'}});
 try{const r=await runtime(env);const rows=await r.repository.readPublishedProducts(merch.map(p=>p.id));const state={products:Object.fromEntries(rows.map(p=>[p.id,p]))};return Response.json({products:publicProducts(state),setupPreviews:publicSetupPreviews(state),hiddenProductIds:rows.filter(p=>(p.status==='archived'||p.published&&p.status!=='published')&&merch.some(m=>m.id===p.id)).map(p=>p.id)},{headers:{...headers,'Cache-Control':'public, max-age=0, s-maxage=30'}});}
 catch{return Response.json({error:'Product previews are temporarily unavailable.'},{status:503,headers});}
}
export default request=>productsHttp(request);
export const config={path:'/api/products'};
