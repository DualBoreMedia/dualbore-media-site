import {ClerkProvider,useAuth} from '@clerk/react';
import ProductionStore from './ProductionStore.jsx';
function Connected(){const{getToken,isSignedIn}=useAuth();return <ProductionStore getToken={isSignedIn?getToken:undefined}/>;}
export default function ClerkStore({publishableKey}){return <ClerkProvider publishableKey={publishableKey} telemetry={{disabled:true}}><Connected/></ClerkProvider>;}
