import {workosHttp} from '../operations/workos-http.mjs';
export default (request,context)=>workosHttp(request,{clientIp:context.ip||'unavailable'});
export const config={path:'/api/auth/*'};
