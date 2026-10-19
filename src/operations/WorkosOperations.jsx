import {useCallback,useEffect,useState} from 'react';
import OperationsApp from './OperationsApp.jsx';
import StaffApp from './StaffApp.jsx';
export const cookieToken=Object.assign(async()=>null,{cookieSession:true});
export default function WorkosOperations({admin=false}){
 const[state,setState]=useState({isLoaded:false,isSignedIn:false});
 const staff=admin||window.location.pathname.startsWith('/staff');
 useEffect(()=>{let active=true;async function load(){try{let response=await fetch('/api/auth/session',{credentials:'same-origin',cache:'no-store'});if(response.status===401){const refreshed=await fetch('/api/auth/refresh',{method:'POST',credentials:'same-origin'});if(refreshed.ok)response=await fetch('/api/auth/session',{credentials:'same-origin',cache:'no-store'});}const body=await response.json();if(active)setState({isLoaded:true,isSignedIn:response.ok&&body.signedIn===true,user:body.user});}catch{if(active)setState({isLoaded:true,isSignedIn:false});}}load();return()=>{active=false;};},[]);
 const signOut=useCallback(async()=>{try{const response=await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'});if(!response.ok)throw Error();setState({isLoaded:true,isSignedIn:false});window.location.assign('/account');}catch{window.alert('Sign-out could not be confirmed. Try again.');}},[]);
 const failed=new URLSearchParams(window.location.search).get('auth')==='failed';
 const auth={...state,getToken:cookieToken,signOut,signInElement:<div>{failed&&<p role="alert">We could not complete sign-in. Please try signing in again.</p>}<a className="ops-primary" href={'/api/auth/sign-in'+(staff?'?staff=1':'')}>Secure sign in</a>{!staff&&<a href="/api/auth/sign-in?signup=1">Create account</a>}</div>,accountElement:<a href={'/api/auth/sign-in'+(staff?'?staff=1':'')}>Verify sign-in again</a>};
 return staff?<StaffApp auth={auth} adminView={admin} renderAdmin={()=><OperationsApp admin auth={auth}/>}/>:<OperationsApp auth={auth}/>;
}
