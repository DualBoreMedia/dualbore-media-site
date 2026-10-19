import {structuredLog,requestContext} from '../observability/index.mjs';
import {randomUUID} from 'node:crypto';
// Provider event IDs and request payloads are deliberately excluded.
export function operationLog(scope,category,{status,log=console.warn}={}){
 return structuredLog('operation.result',{requestId:requestContext().requestId||randomUUID(),scope,category,status},{level:status>=500?'error':'warn',log});
}
