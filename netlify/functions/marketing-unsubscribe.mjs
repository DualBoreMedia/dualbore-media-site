import{marketingHttp}from'../operations/marketing-http.mjs';
export default(request,context)=>marketingHttp(request,{clientIp:context.ip||'unavailable'});
export const config={path:'/api/marketing/unsubscribe'};
