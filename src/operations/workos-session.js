// One bounded refresh per request; concurrent requests share token rotation.
const refreshing=new WeakMap();
const rotations=new WeakMap();
export async function workosSessionFetch(url,options={},fetcher=fetch){
 const startedAtRotation=rotations.get(fetcher)||0;
 const response=await fetcher(url,{...options,credentials:'same-origin',cache:'no-store'});
 if(response.status!==401)return response;
 // A slower request can return its old 401 after another request already
 // rotated the cookie. Reuse that session rather than rotating it again.
 if((rotations.get(fetcher)||0)!==startedAtRotation)return fetcher(url,{...options,credentials:'same-origin',cache:'no-store'});
 let pending=refreshing.get(fetcher);
 if(!pending){pending=fetcher('/api/auth/refresh',{method:'POST',credentials:'same-origin',cache:'no-store'}).then(result=>{if(result.ok)rotations.set(fetcher,(rotations.get(fetcher)||0)+1);return result;}).finally(()=>refreshing.delete(fetcher));refreshing.set(fetcher,pending);}
 const refresh=await pending;
 if(!refresh.ok){
  if(refresh.status===401)return response;
  const error=new Error('Secure sign-in is temporarily unavailable. Your session has been kept. Try again shortly.');error.code='auth_refresh_unavailable';throw error;
 }
 return fetcher(url,{...options,credentials:'same-origin',cache:'no-store'});
}
export function workosSignInUrl({staff=false,stepUp=false}={}){
 const params=new URLSearchParams();if(staff)params.set('staff','1');if(stepUp)params.set('step_up','1');
 const path=window.location.pathname;
 if(['/account','/staff','/admin'].includes(path)){const view=new URLSearchParams(window.location.search).get('view');params.set('returnTo',path+(view?'?view='+encodeURIComponent(view):''));}
 return '/api/auth/sign-in'+(params.size?'?'+params:'');
}
export function rememberOperationsView(view){
 if(['/account','/staff','/admin'].includes(window.location.pathname))history.replaceState(null,'',window.location.pathname+'?view='+encodeURIComponent(view.toLowerCase()));
}
