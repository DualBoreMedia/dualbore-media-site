import { processSubmission } from '../lib/drop-waitlist-email.mjs';
import {observeTask,structuredLog} from '../observability/index.mjs';
import {serverErrorReporter} from '../observability/server.mjs';

// Only the platform event is exposed. There is no public HTTP email-sending route.
// Netlify verifies the event's JWS before invoking formSubmitted.
export default {
  async formSubmitted(event) {
    const env=process.env,reporter=await serverErrorReporter(env);
    await observeTask(()=>processSubmission(event,{log:(code,details)=>structuredLog(code,{scope:'waitlist',status:details?.status,count:details?.attempt},{env})}),{scope:'waitlist',env,reporter})();
  },
};
