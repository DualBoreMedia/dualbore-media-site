import {operationsHttp} from '../operations/http.mjs';
export default (request,context)=>operationsHttp(request,{clientIp:context.ip||'unavailable'});
export const config={path:'/api/operations'};
