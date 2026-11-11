import {setupFilesHttp} from '../setups/files-http.mjs';
export default (request,context)=>setupFilesHttp(request,{clientIp:context.ip});
export const config={path:'/api/setup-files'};
