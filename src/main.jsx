import React, {lazy,Suspense} from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import "./styles.css";
import "./product-polish.css";
import "./public-detail.css";
import "./ui-polish.css";
import {ErrorBoundary} from './observability/ErrorBoundary.jsx';
import {configureBrowserMonitoring,installBrowserErrorHandlers} from './observability/client.js';
const ManagedOperations=lazy(()=>import('./operations/ManagedOperations.jsx'));
const Unsubscribe=lazy(()=>import('./operations/Unsubscribe.jsx'));
const ProductionStore=lazy(()=>import('./commerce/ManagedStore.jsx'));
const PublicDetail=lazy(()=>import('./PublicDetail.jsx'));
const SetupShop=lazy(()=>import('./setups/SetupShop.jsx'));
export async function start(element=document.getElementById('root')){
 if(!element)throw new Error('The application root is missing.');
 const detailRoute=/^\/(?:builds\/[a-z0-9_-]+|videos\/[A-Za-z0-9_-]{11})\/?$/.test(window.location.pathname);
 const setupRoute=/^\/setups\/?$/.test(window.location.pathname);
 const store=window.location.pathname==='/shop'||(import.meta.env.MODE!=='commerce'&&/^\/order\/(success|pending|cancel)$/.test(window.location.pathname));
 const operations=/^\/(account|admin|staff)(\/|$)/.test(window.location.pathname);
 if(import.meta.env.VITE_ERROR_MONITORING_ENABLED==='true'){
  try{const Sentry=await import('@sentry/react');configureBrowserMonitoring(Sentry,{dsn:import.meta.env.VITE_SENTRY_DSN,enabled:true,release:__APP_RELEASE__,environment:__APP_ENVIRONMENT__});}
  catch{console.warn('Error monitoring could not initialize. Provider verification is required.');}
 }
 const removeErrorHandlers=installBrowserErrorHandlers();
 const root=createRoot(element);
 root.render(
  <React.StrictMode>
    <ErrorBoundary>
    {detailRoute?<Suspense fallback={<main className="detail-main" role="status">Loading the garage journal...</main>}><PublicDetail/></Suspense>:operations?<Suspense fallback={<main className="store-page" role="status">Loading your garage...</main>}><ManagedOperations admin={window.location.pathname.startsWith('/admin')}/></Suspense>:window.location.pathname==='/unsubscribe'?<Suspense fallback={<main role="status">Loading email preferences...</main>}><Unsubscribe/></Suspense>:setupRoute?<Suspense fallback={<main className="mxb-page" role="status">Loading MX Bikes setups...</main>}><SetupShop/></Suspense>:store?<Suspense fallback={<main className="store-page" role="status">Loading the garage store...</main>}><ProductionStore/></Suspense>:<App />}
    </ErrorBoundary>
  </React.StrictMode>,
);
 return ()=>{root.unmount();removeErrorHandlers();};
}
export const applicationReady=start();
