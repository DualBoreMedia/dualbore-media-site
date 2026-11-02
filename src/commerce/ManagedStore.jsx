import {lazy,Suspense} from 'react';
import ProductionStore from './ProductionStore.jsx';

// Clerk stays available for legacy compatibility but is never fetched for a WorkOS/guest storefront.
const ClerkStore=lazy(()=>import('./ClerkStore.jsx'));
export default function ManagedStore(){
 const key=import.meta.env.VITE_AUTH_PROVIDER==='clerk'&&import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
 return key?<Suspense fallback={<main className="store-page" role="status">Loading the garage store...</main>}><ClerkStore publishableKey={key}/></Suspense>:<ProductionStore/>;
}
