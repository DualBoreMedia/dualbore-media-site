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
 }
 render(){
  if(!this.state.failed)return this.props.children;
  return <main className="error-fallback"><section role="alert" aria-labelledby="application-error-title"><h1 id="application-error-title">The garage hit a snag</h1><p>Please reload and try again. Your saved cart stays on this device.</p>{this.state.reference&&<p>Reference: <code>{this.state.reference}</code></p>}<button type="button" onClick={()=>window.location.reload()}>Reload the garage</button><p><a href="/">Return to DualBore Media</a></p></section></main>;
 }
}
