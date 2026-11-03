import {commerceHttp} from '../commerce/http.mjs';
export default (request,context)=>commerceHttp(request,{clientIp:context.ip||'unavailable'});
export const config={path:'/api/commerce/checkout'};
