import {sanitizeMonitoringEvent,safeMetadata} from '../../netlify/observability/safe.mjs';
let reporter;
export function configureBrowserMonitoring(sdk,{dsn,enabled=false,release='local',environment='development'}={}) {
 if(!enabled||!dsn||!sdk)return false;
 sdk.init({dsn,release,environment,sendDefaultPii:false,defaultIntegrations:false,tracesSampleRate:0,autoSessionTracking:false,beforeSend:sanitizeMonitoringEvent});
 reporter=sdk;
 return true;
}
export function reportBrowserError(error,{reference,release,environment}={}) {
 if(!reporter)return false;
 try {reporter.withScope(scope=>{scope.setTags(safeMetadata({requestId:reference,release,environment,scope:'frontend'}));reporter.captureException(error);});return true;}catch{return false;}
}
// Call once at app startup. No session replay, network bodies, console breadcrumbs or user identity.
export function installBrowserErrorHandlers(target=window) {
 const onError=event=>reportBrowserError(event.error||new Error('Uncaught application error'));
 const onRejection=event=>reportBrowserError(event.reason instanceof Error?event.reason:new Error('Unhandled application rejection'));
 target.addEventListener('error',onError);target.addEventListener('unhandledrejection',onRejection);
 return ()=>{target.removeEventListener('error',onError);target.removeEventListener('unhandledrejection',onRejection);};
}
