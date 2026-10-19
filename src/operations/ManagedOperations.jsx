import {ClerkProvider,SignIn,UserButton,useAuth,useUser,useReverification} from '@clerk/react';
import OperationsApp from './OperationsApp.jsx';
import StaffApp from './StaffApp.jsx';
import WorkosOperations from './WorkosOperations.jsx';

function Connected({admin}){
 const {isLoaded,isSignedIn,getToken,signOut}=useAuth();const {user}=useUser();
 const fetcher=useReverification(async(url,options)=>fetch(url,{...options,headers:{...options.headers,Authorization:`Bearer ${await getToken({skipCache:true})}`}}));
 const staff=admin||window.location.pathname.startsWith('/staff');
 const auth={isLoaded,isSignedIn,getToken,user,signOut,fetcher,
   signInElement:<SignIn routing="hash" fallbackRedirectUrl={admin?'/admin':staff?'/staff':'/account'}/>,
   accountElement:<UserButton/>};
 return staff?<StaffApp auth={auth} adminView={admin} renderAdmin={()=><OperationsApp admin auth={auth}/>}/>:<OperationsApp auth={auth}/>;
}
export default function ManagedOperations({admin=false}){
 if(import.meta.env.VITE_AUTH_PROVIDER!=='clerk')return <WorkosOperations admin={admin}/>;
 const key=import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
 if(!key&&(admin||window.location.pathname.startsWith('/staff')))return <main className="store-page"><h1>Page unavailable</h1><a href="/">Back to garage</a></main>;
 if(!key)return <OperationsApp auth={{isLoaded:true,isSignedIn:false,signInElement:<p role="status">Secure sign-in is not configured yet. Accounts will open after the managed provider is connected.</p>}}/>;
 return <ClerkProvider publishableKey={key} telemetry={{disabled:true}} appearance={{variables:{colorPrimary:'#ff2a3b',colorBackground:'#13161c',colorText:'#f5f7fb',colorTextSecondary:'#b8c1ce',colorInputBackground:'#0b0d10',colorInputText:'#f5f7fb',borderRadius:'4px'}}}><Connected admin={admin}/></ClerkProvider>;
}
