import React, {lazy,Suspense} from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import "./styles.css";
import {ErrorBoundary} from './observability/ErrorBoundary.jsx';
import {configureBrowserMonitoring,installBrowserErrorHandlers} from './observability/client.js';
const ManagedOperations=lazy(()=>import('./operations/ManagedOperations.jsx'));
const Unsubscribe=lazy(()=>import('./operations/Unsubscribe.jsx'));
const ProductionStore=lazy(()=>import('./commerce/ManagedStore.jsx'));
const store=window.location.pathname==='/shop'||(import.meta.env.MODE!=='commerce'&&/^\/order\/(success|pending|cancel)$/.test(window.location.pathname));
const operations=/^\/(account|admin|staff)(\/|$)/.test(window.location.pathname);

async function start(){
 if(import.meta.env.VITE_ERROR_MONITORING_ENABLED==='true'){
  try{const Sentry=await import('@sentry/react');configureBrowserMonitoring(Sentry,{dsn:import.meta.env.VITE_SENTRY_DSN,enabled:true,release:__APP_RELEASE__,environment:__APP_ENVIRONMENT__});}
  catch{console.warn('Error monitoring could not initialize. Provider verification is required.');}
 }
 installBrowserErrorHandlers();
 createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
    {operations?<Suspense fallback={<main className="store-page" role="status">Loading your garage...</main>}><ManagedOperations admin={window.location.pathname.startsWith('/admin')}/></Suspense>:window.location.pathname==='/unsubscribe'?<Suspense fallback={<main role="status">Loading email preferences...</main>}><Unsubscribe/></Suspense>:store?<Suspense fallback={<main className="store-page" role="status">Loading the garage store...</main>}><ProductionStore/></Suspense>:<App />}
    </ErrorBoundary>
  </React.StrictMode>,
);
}
start();
