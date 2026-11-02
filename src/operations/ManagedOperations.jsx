import {lazy,Suspense} from 'react';
const WorkosOperations=lazy(()=>import('./WorkosOperations.jsx'));
const ClerkOperations=lazy(()=>import('./ClerkOperations.jsx'));

// Only load private auth and operations code after an explicit private route.
export default function ManagedOperations({admin=false}){
 const staffOnly=import.meta.env.VITE_AUTH_ACCESS_MODE==='staff-only';
 if(staffOnly&&!admin&&!window.location.pathname.startsWith('/staff'))return <main className="store-page"><h1>Customer accounts are not open yet.</h1><p>Orders and Drop Alert signups remain paused.</p><a href="/">Back to garage</a></main>;
 return <Suspense fallback={<main className="store-page" role="status">Loading your garage...</main>}>{import.meta.env.VITE_AUTH_PROVIDER==='clerk'?<ClerkOperations admin={admin}/>:<WorkosOperations admin={admin}/>}</Suspense>;
}
