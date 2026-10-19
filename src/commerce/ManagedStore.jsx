import {ClerkProvider,useAuth} from '@clerk/react';
import ProductionStore from './ProductionStore.jsx';
function Connected(){const{getToken,isSignedIn}=useAuth();return <ProductionStore getToken={isSignedIn?getToken:undefined}/>;}
export default function ManagedStore(){const key=import.meta.env.VITE_AUTH_PROVIDER==='clerk'&&import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;return key?<ClerkProvider publishableKey={key} telemetry={{disabled:true}}><Connected/></ClerkProvider>:<ProductionStore/>;}
