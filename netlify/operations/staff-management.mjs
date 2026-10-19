import {createHash,randomUUID} from 'node:crypto';
import {CommerceError} from '../commerce/service.mjs';
import {requirePermission} from './permissions.mjs';

const fail=(code,message,status=400)=>{throw new CommerceError(code,message,status);};
const hash=value=>createHash('sha256').update(value).digest('hex');
const role=user=>['employee','admin'].includes(user.privateMetadata?.role)?user.privateMetadata.role:'customer';
const primary=user=>user.emailAddresses?.find(e=>e.id===user.primaryEmailAddressId);
const safeUser=user=>({userId:user.id,name:[user.firstName,user.lastName].filter(x=>typeof x==='string').join(' ').slice(0,160),email:primary(user)?.emailAddress||'',role:role(user),status:user.deleted||user.banned||user.locked?'unavailable':role(user)==='customer'&&user.privateMetadata?.staffAccess?.revokedAt?'revoked':'active',mfaEnrolled:user.twoFactorEnabled===true,mfaRequired:true,grantedAt:user.privateMetadata?.staffAccess?.grantedAt||null,revokedAt:user.privateMetadata?.staffAccess?.revokedAt||null,createdAt:user.createdAt||null});
const schema=(input,keys)=>{if(!input||Array.isArray(input)||Object.keys(input).sort().join()!==['action','requestKey','confirmed',...keys].sort().join()||input.confirmed!==true||!/^[a-f0-9-]{36}$/i.test(input.requestKey||''))fail('invalid_staff_request','Confirm a valid staff access request.');};

export function createStaffManagement({repository,env=process.env,client,now=()=>new Date()}){
 const timestamp=()=>now().toISOString();
 const audit=(state,principal,action,target,metadata)=>{const id=randomUUID();state.audit[id]={id,actor:principal.userId,action,target,metadata,createdAt:timestamp()};};
 async function authorize(principal){try{requirePermission(principal,'staff-management');}catch(error){if(principal?.userId)await repository.transaction(s=>audit(s,principal,'authorization-denied','staff-management',{code:error.code}));throw error;}}
 async function provider(){
  if(env.AUTH_PROVIDER==='workos'){const {createWorkosStaffProvider}=await import('./workos-staff-provider.mjs');return createWorkosStaffProvider({env,client});}
  if(client)return client;
  if(!env.CLERK_SECRET_KEY||!env.SITE_ORIGIN)fail('staff_unavailable','Staff management is not configured.',503);
  if(env.COMMERCE_ENVIRONMENT==='production'&&!env.CLERK_SECRET_KEY.startsWith('sk_live_'))fail('staff_unavailable','Production staff management is not configured.',503);
  const {createClerkClient}=await import('@clerk/backend');client=createClerkClient({secretKey:env.CLERK_SECRET_KEY});return client;
 }
 async function reconcile(principal,input,c){
  schema(input,['targetRequestKey','note']);
  if(!/^[a-f0-9-]{36}$/i.test(input.targetRequestKey||'')||typeof input.note!=='string'||input.note.trim().length<10||input.note.length>1000)fail('invalid_staff_request','Record the provider review and choose a valid unresolved request.');
  const original=await repository.transaction(s=>Object.values(s.audit).find(a=>a.action==='staff-change-requested'&&a.metadata.requestKey===input.targetRequestKey));
  if(!original?.metadata.request)fail('staff_reconciliation_required','This request needs manual provider and audit review before reconciliation.',409);
  const actor=await c.users.getUser(principal.userId);if(role(actor)!=='admin'||actor.banned||actor.locked||actor.deleted||!actor.twoFactorEnabled)fail('admin_required','Administrator access changed. Sign in again.',403);
  const request=original.metadata.request;let result;
  // Reconciliation only reads the authentication provider. Finish the intended change there first;
  // never infer that an absent result means a timed-out write did not happen.
  if(request.action==='staff-role'){
   const user=await c.users.getUser(request.targetUserId);
   if(user.id!==request.targetUserId||role(user)!==request.role||user.banned||user.locked||user.deleted||request.role!=='customer'&&(!user.twoFactorEnabled||primary(user)?.verification?.status!=='verified'))fail('staff_reconciliation_required','The authentication provider does not confirm the intended role and enrollment. Review the account in the authentication provider first.',409);
   result={saved:true,member:safeUser(user)};
  }else{
   const query=request.action==='staff-invite'?request.email:request.invitationId;
   const invitations=await c.invitations.getInvitationList({limit:100,offset:0,query,...request.action==='staff-revoke-invitation'?{status:'revoked'}:{}});
   if(invitations.totalCount>100)fail('staff_reconciliation_required','Invitation lookup is ambiguous. Review it in the authentication provider first.',409);
   const matches=invitations.data.filter(i=>request.action==='staff-invite'?i.emailAddress?.toLowerCase()===request.email.toLowerCase()&&['pending','accepted'].includes(i.status)&&(env.AUTH_PROVIDER!=='workos'||i.role==='customer')&&Number(i.createdAt)>=Date.parse(original.createdAt)-5000:i.id===request.invitationId&&i.status==='revoked');
   if(matches.length!==1)fail('staff_reconciliation_required','The authentication provider does not confirm one intended invitation outcome. Review it in the authentication provider first.',409);
   result={saved:true,invitationId:matches[0].id,status:matches[0].status,...request.action==='staff-invite'?{requiresPromotion:true}:{}};
  }
  return repository.transaction(s=>{
   const events=Object.values(s.audit),completion=events.find(a=>a.action==='staff-change-confirmed'&&a.metadata.requestKey===input.targetRequestKey);
   if(completion)return {reconciled:true,result:completion.metadata.result};
   if(!events.some(a=>a.action==='staff-change-uncertain'&&a.metadata.requestKey===input.targetRequestKey)&&now().getTime()-Date.parse(original.createdAt)<300000)fail('staff_reconciliation_required','This provider request may still be running. Review again after five minutes.',409);
   if(events.some(a=>a.action==='staff-change-rejected'&&a.metadata.requestKey===input.targetRequestKey))fail('request_conflict','This request was already rejected.',409);
   audit(s,principal,'staff-change-confirmed',original.target,{requestKey:input.targetRequestKey,result,reconciled:true,resolutionRequestKey:input.requestKey,note:input.note.trim()});
   return {reconciled:true,result};
  });
 }
 async function read(principal,{search='',page=1}={}){
  await authorize(principal);const c=await provider();const pageNumber=Math.max(1,Math.min(10000,Number.isSafeInteger(Number(page))?Number(page):1));
  let users,invitations;
  try{[users,invitations]=await Promise.all([c.users.getUserList({limit:100,offset:(pageNumber-1)*100,...search?{query:String(search).slice(0,100)}:{}}),c.invitations.getInvitationList({limit:100,offset:0,status:'pending'})]);}catch{fail('staff_provider_unavailable','Staff accounts could not be loaded. Try again shortly.',503);}
  const activity=await repository.transaction(s=>{audit(s,principal,'staff-directory-viewed','staff-management',{page:pageNumber});return Object.values(s.audit).filter(a=>a.action==='staff-session').reduce((map,a)=>{if(!map[a.actor]||map[a.actor]<a.createdAt)map[a.actor]=a.createdAt;return map;},{});});
  const unresolved=await repository.transaction(s=>{const events=Object.values(s.audit);return events.filter(a=>a.action==='staff-change-requested'&&!events.some(done=>['staff-change-confirmed','staff-change-rejected'].includes(done.action)&&done.metadata.requestKey===a.metadata.requestKey)).map(a=>({requestKey:a.metadata.requestKey,action:a.metadata.requestedAction,target:a.target,role:a.metadata.requestedRole,createdAt:a.createdAt}));});
  return {unresolved,members:users.data.filter(u=>search||role(u)!=='customer'||u.privateMetadata?.staffAccess?.revokedAt).map(u=>({...safeUser(u),lastStaffActivityAt:activity[u.id]||null})),invitations:invitations.data.map(i=>({invitationId:i.id,email:i.emailAddress,status:i.status,createdAt:i.createdAt,role:'customer',requiresPromotion:true})),pagination:{page:pageNumber,pageSize:100,totalAccounts:users.totalCount},invitationNotice:'Invitations create ordinary accounts. Verify the person and explicitly grant a staff role after signup and MFA enrollment.'};
 }
 async function mutate(principal,input){
  await authorize(principal);
  if(input?.action==='staff-reconcile')return reconcile(principal,input,await provider());
  if(input?.action==='staff-invite'){
   schema(input,['email']);if(typeof input.email!=='string'||input.email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(input.email)||/[\u0000-\u001f\u007f]/.test(input.email))fail('invalid_staff_request','Enter a valid invitation email.');
  }else if(input?.action==='staff-role'){
   schema(input,['targetUserId','role','expectedRole']);if(!(env.AUTH_PROVIDER==='workos'?/^workos:user_[A-Za-z0-9]+$/:/^user_[A-Za-z0-9]+$/).test(input.targetUserId||'')||!['customer','employee','admin'].includes(input.role)||!['customer','employee','admin'].includes(input.expectedRole))fail('invalid_staff_request','Choose a valid account and role.');
   if(input.targetUserId===principal.userId)fail('self_role_change','Another administrator must change your staff access.',409);
  }else if(input?.action==='staff-revoke-invitation'){
   schema(input,['invitationId']);if(!(env.AUTH_PROVIDER==='workos'?/^workos:invitation_[A-Za-z0-9]+$/:/^inv_[A-Za-z0-9]+$/).test(input.invitationId||''))fail('invalid_staff_request','Choose a valid invitation.');
  }else fail('invalid_staff_request','Choose a supported staff action.');
  const c=await provider(),signature=hash(JSON.stringify(input)),requestKey=input.requestKey;
  const previous=await repository.transaction(s=>{
   const events=Object.values(s.audit),request=events.find(a=>a.action==='staff-change-requested'&&a.metadata.requestKey===requestKey);
   if(request){if(request.actor!==principal.userId||request.metadata.signature!==signature)fail('request_conflict','This request belongs to a different staff change.',409);const completion=events.find(a=>a.action==='staff-change-confirmed'&&a.metadata.requestKey===requestKey);if(completion)return completion.metadata.result;fail('staff_reconciliation_required','This staff change needs provider reconciliation. Do not repeat it with a new request.',409);}
   // Serialize privileged provider writes, including two admins demoting each
   // other. An uncertain external result blocks later writes until reconciled.
   if(events.some(a=>a.action==='staff-change-requested'&&!events.some(done=>['staff-change-confirmed','staff-change-rejected'].includes(done.action)&&done.metadata.requestKey===a.metadata.requestKey)))fail('staff_reconciliation_required','A previous staff change still needs provider reconciliation.',409);
   const {confirmed,requestKey:ignored,...details}=input;
   audit(s,principal,'staff-change-requested',input.targetUserId||input.invitationId||'invitation',{requestKey,signature,request:details,requestedAction:input.action,requestedRole:input.role||null});return null;
  });
  if(previous)return previous;
  let result,mutationStarted=false,writeCompleted=false;
  try{
   // Re-read the actor immediately before changing provider authorization.
   const actor=await c.users.getUser(principal.userId);if(role(actor)!=='admin'||actor.banned||actor.locked||actor.deleted||!actor.twoFactorEnabled)fail('admin_required','Administrator access changed. Sign in again.',403);
   if(input.action==='staff-invite'){
    const origin=new URL(env.SITE_ORIGIN);if(origin.origin!==env.SITE_ORIGIN||!['https:','http:'].includes(origin.protocol)||(env.COMMERCE_ENVIRONMENT==='production'&&origin.protocol!=='https:'))fail('staff_unavailable','The account origin is not configured.',503);
    mutationStarted=true;const invitation=await c.invitations.createInvitation({emailAddress:input.email.trim().toLowerCase(),ignoreExisting:false,notify:true,expiresInDays:7,redirectUrl:origin.origin+'/account'});
    if(!(env.AUTH_PROVIDER==='workos'?/^workos:invitation_[A-Za-z0-9]+$/:/^inv_[A-Za-z0-9]+$/).test(invitation.id||''))throw new Error('Unconfirmed invitation');
    result={saved:true,invitationId:invitation.id,status:invitation.status,requiresPromotion:true};
   }else if(input.action==='staff-revoke-invitation'){
    mutationStarted=true;const invitation=await c.invitations.revokeInvitation(input.invitationId);if(invitation.id!==input.invitationId||invitation.status!=='revoked')throw new Error('Unconfirmed invitation revocation');result={saved:true,invitationId:invitation.id,status:'revoked'};
   }else{
    const target=await c.users.getUser(input.targetUserId);if(target.id!==input.targetUserId||target.deleted||target.banned||target.locked)fail('invalid_staff_account','Choose an active account.',409);
    if(role(target)!==input.expectedRole)fail('stale_role','The role changed. Reload before saving.',409);
    if(input.role!=='customer'&&(!target.twoFactorEnabled||primary(target)?.verification?.status!=='verified'))fail('staff_enrollment_required','The account must verify its primary email and enroll MFA before receiving staff access.',409);
    const time=timestamp(),access=input.role==='customer'?{revokedAt:time,revokedBy:principal.userId}:{grantedAt:time,grantedBy:principal.userId,revokedAt:null,revokedBy:null};
    mutationStarted=true;await c.users.updateUserMetadata(target.id,{privateMetadata:{role:input.role,staffAccess:access}});writeCompleted=true;
    const confirmed=await c.users.getUser(target.id);if(role(confirmed)!==input.role)throw new Error('Unconfirmed role');result={saved:true,member:safeUser(confirmed)};
   }
   await repository.transaction(s=>audit(s,principal,'staff-change-confirmed',input.targetUserId||input.invitationId||'invitation',{requestKey,result,role:input.role||null}));return result;
  }catch(error){
   // A definitive provider validation/auth rejection did not apply the write.
   // Timeouts, conflicts and transport/server failures remain uncertain.
   if(error.providerWriteNotStarted||!writeCompleted&&!error.providerWriteApplied&&[400,401,403,404,422].includes(error?.status))mutationStarted=false;
   await repository.transaction(s=>audit(s,principal,mutationStarted?'staff-change-uncertain':'staff-change-rejected',input.targetUserId||input.invitationId||'invitation',{requestKey,code:error instanceof CommerceError?error.code:'provider_unavailable'}));
   if(!mutationStarted&&error instanceof CommerceError)throw error;
   fail(mutationStarted?'staff_reconciliation_required':'staff_provider_unavailable',mutationStarted?'The staff change could not be confirmed. Review the authentication provider and the audit before another access change.':'Staff management is temporarily unavailable.',503);
  }
 }
 return {read,mutate};
}
