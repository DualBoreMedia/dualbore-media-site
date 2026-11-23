import React from 'react';
import {reportBrowserError} from './client.js';
import './error-boundary.css';
export class ErrorBoundary extends React.Component {
 state={failed:false,reference:null};
 static getDerivedStateFromError(){return {failed:true};}
 componentDidCatch(error){
  // Incident 2026-11-17 (Sentry WEB-3, older release 6522f5a): an unguarded
  // crypto.randomUUID() could itself throw while handling an earlier render
  // failure. The *earlier* exception is unknown from the redacted alert.
  // The support reference is optional, never a prerequisite for recovery.
  // Keep this catch narrow: always forward the ORIGINAL error to the privacy-
  // preserving reporter and render Reload/Return even without Web Crypto.
  let reference=null;
  try{reference=globalThis.crypto?.randomUUID?.()||null;}catch{}
  this.setState({reference});
  reportBrowserError(error,{reference});
  // Search engines may execute JS. Never let a temporary client error page
  // appear as an indexable result. This is not a substitute for identifying
  // the original exception or inspecting Search Console.
  try{
   const head=globalThis.document?.head,existing=head?.querySelector('meta[name="robots"]');
   if(head){
    this.previousRobots=existing?.getAttribute('content')??null;
    this.ownedRobots=!existing;
    this.errorRobots=existing||head.ownerDocument.createElement('meta');
    if(this.ownedRobots){this.errorRobots.setAttribute('name','robots');head.append(this.errorRobots);}
    this.errorRobots.setAttribute('content','noindex, nofollow');
   }
  }catch{}
 }
 componentWillUnmount(){
  // Existing noindex policies must survive, and client-only crash metadata
  // must not remain behind when React unmounts the fallback.
  if(!this.errorRobots)return;
  try{
   if(this.ownedRobots)this.errorRobots.remove();
   else if(this.previousRobots===null)this.errorRobots.removeAttribute('content');
   else this.errorRobots.setAttribute('content',this.previousRobots);
  }catch{}
 }
 render(){
  if(!this.state.failed)return this.props.children;
  return <main className="error-fallback"><section role="alert" aria-labelledby="application-error-title"><h1 id="application-error-title">The garage hit a snag</h1><p>Please reload and try again. You can return to the garage while we look into the problem.</p>{this.state.reference&&<p>Reference: <code>{this.state.reference}</code></p>}<button type="button" onClick={()=>window.location.reload()}>Reload the garage</button><p><a href="/">Return to DualBore Media</a></p></section></main>;
 }
}
