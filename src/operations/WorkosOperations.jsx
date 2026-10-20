import {useCallback,useEffect,useState} from 'react';
import OperationsApp from './OperationsApp.jsx';
import StaffApp from './StaffApp.jsx';
import {channel} from '../content.js';
export const cookieToken=Object.assign(async()=>null,{cookieSession:true});
export default function WorkosOperations({admin=false}){
 const[state,setState]=useState({isLoaded:false,isSignedIn:false});
 const[attempt,setAttempt]=useState(0);
 const staff=admin||window.location.pathname.startsWith('/staff');
 useEffect(()=>{
  let active=true;
  async function load(){
   try{
    let response=await fetch('/api/auth/session',{credentials:'same-origin',cache:'no-store'});
    if(response.status===401){
     const refreshed=await fetch('/api/auth/refresh',{method:'POST',credentials:'same-origin'});
     if(!refreshed.ok&&refreshed.status!==401){
      throw Error('Account refresh unavailable');
     }
     if(refreshed.ok){
      response=await fetch('/api/auth/session',{credentials:'same-origin',cache:'no-store'});
     }
    }
    if(!response.ok&&response.status!==401){
     throw Error('Account access unavailable');
    }
    const body=await response.json();
    if(active){
     setState({isLoaded:true,isSignedIn:response.ok&&body.signedIn===true,user:body.user});
    }
   }catch{
    if(active){
     setState({isLoaded:true,isSignedIn:false,unavailable:true});
    }
   }
  }
  load();
  return()=>{active=false;};
 },[attempt]);
 const signOut=useCallback(async()=>{try{const response=await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'});if(!response.ok)throw Error();setState({isLoaded:true,isSignedIn:false});window.location.assign('/account');}catch{window.alert('Sign-out could not be confirmed. Try again.');}},[]);
 const failed=new URLSearchParams(window.location.search).get('auth')==='failed';
 const auth={...state,getToken:cookieToken,signOut,signInElement:state.unavailable?<section className="account-unavailable" aria-label="Account availability"><h3>Keep your place in the garage.</h3><p role="status">Account access is temporarily unavailable. Orders are not open yet, and no purchase or account change has been made. You can still explore the builds and Drop 01 designs.</p><div className="order-actions"><button className="ops-primary" onClick={()=>{setState({isLoaded:false,isSignedIn:false});setAttempt(value=>value+1);}}>Check account access</button><a href="/#merch">Explore Drop 01</a></div><a href={channel.url} target="_blank" rel="noopener noreferrer" aria-label="Visit DualBore Media on YouTube (opens in a new tab)">Watch the channel</a></section>:<div>{failed&&<p role="alert">We could not complete sign-in. Please try signing in again.</p>}<a className="ops-primary" href={'/api/auth/sign-in'+(staff?'?staff=1':'')}>Secure sign in</a>{!staff&&<a href="/api/auth/sign-in?signup=1">Create account</a>}</div>,accountElement:<a href={'/api/auth/sign-in'+(staff?'?staff=1':'')}>Verify sign-in again</a>};
 return staff?<StaffApp auth={auth} adminView={admin} renderAdmin={()=><OperationsApp admin auth={auth}/>}/>:<OperationsApp auth={auth}/>;
}
