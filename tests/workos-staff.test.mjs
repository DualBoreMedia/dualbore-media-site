import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createWorkosStaffProvider} from '../netlify/operations/workos-staff-provider.mjs';
import {createStaffManagement} from '../netlify/operations/staff-management.mjs';
import {createMemoryRepository} from '../netlify/commerce/memory-repository.mjs';
const env={AUTH_PROVIDER:'workos',SITE_ORIGIN:'https://garage.example',WORKOS_API_KEY:'fixture',WORKOS_CLIENT_ID:'client_fixture',WORKOS_COOKIE_PASSWORD:'fixture-password-at-least-thirty-two-characters',WORKOS_STAFF_ORGANIZATION_ID:'org_staff',WORKOS_STAFF_MFA_POLICY_VERIFIED:'true'};
function fixture(){const users={user_admin:{id:'user_admin',email:'admin@example.com',emailVerified:true},user_worker:{id:'user_worker',email:'worker@example.com',emailVerified:true}};
 const memberships={user_admin:{id:'om_admin',organizationId:'org_staff',userId:'user_admin',status:'active',role:{slug:'admin'}},user_worker:{id:'om_worker',organizationId:'org_staff',userId:'user_worker',status:'active',role:{slug:'employee'}}};
 const invitations=[],writes=[],sessions=[{id:'session_worker',userId:'user_worker',status:'active'}];let enrolled=true,failRevoke=false;
 const client={userManagement:{getUser:async id=>users[id],listUsers:async()=>({data:Object.values(users)}),listOrganizationMemberships:async options=>({data:memberships[options.userId]?[structuredClone(memberships[options.userId])]:[]}),updateOrganizationMembership:async(id,options)=>{writes.push(options);const m=Object.values(memberships).find(x=>x.id===id);m.role.slug=options.roleSlug;return structuredClone(m);},listSessions:async userId=>({data:sessions.filter(x=>x.userId===userId)}),revokeSession:async({sessionId})=>{if(failRevoke)throw Object.assign(Error('provider failed after role update'),{status:401});sessions.find(s=>s.id===sessionId).status='revoked';},sendInvitation:async options=>{writes.push(options);const i={id:'invitation_fixture',email:options.email,organizationId:options.organizationId,roleSlug:options.roleSlug,state:'pending',createdAt:new Date().toISOString()};invitations.push(i);return i;},listInvitations:async()=>({data:invitations}),getInvitation:async id=>invitations.find(i=>i.id===id),revokeInvitation:async id=>{const i=invitations.find(x=>x.id===id);i.state='revoked';return i;}},mfa:{listUserAuthFactors:async({userId})=>({data:enrolled?[{userId,type:'totp'}]:[]})}};
 return {client,users,memberships,invitations,writes,sessions,setEnrolled:value=>enrolled=value,setFailRevoke:value=>failRevoke=value};}
test('WorkOS staff adapter maps only fresh organization membership and validates namespaced IDs',async()=>{const f=fixture(),adapter=await createWorkosStaffProvider({env,client:f.client});const user=await adapter.users.getUser('workos:user_worker');assert.equal(user.privateMetadata.role,'employee');assert.equal(user.id,'workos:user_worker');assert.equal(user.twoFactorEnabled,true);f.memberships.user_worker.role.slug='member';assert.equal((await adapter.users.getUser(user.id)).privateMetadata.role,'customer');await assert.rejects(adapter.users.getUser('user_worker'),{code:'invalid_staff_account'});await assert.rejects(createWorkosStaffProvider({env:{...env,WORKOS_STAFF_MFA_POLICY_VERIFIED:'false'},client:f.client}),{code:'staff_provider_unavailable'});});
test('WorkOS role update requires a known unchanged membership, verified email and MFA; revokes active sessions',async()=>{const f=fixture(),adapter=await createWorkosStaffProvider({env,client:f.client});await adapter.users.getUser('workos:user_worker');f.setEnrolled(false);await assert.rejects(adapter.users.updateUserMetadata('workos:user_worker',{privateMetadata:{role:'admin'}}),{code:'staff_enrollment_required'});assert.equal(f.writes.length,0);f.setEnrolled(true);await adapter.users.updateUserMetadata('workos:user_worker',{privateMetadata:{role:'admin'}});assert.equal(f.memberships.user_worker.role.slug,'admin');assert.equal(f.sessions[0].status,'revoked');await adapter.users.getUser('workos:user_worker');f.memberships.user_worker.role.slug='employee';await assert.rejects(adapter.users.updateUserMetadata('workos:user_worker',{privateMetadata:{role:'customer'}}),{code:'stale_role'});});
test('WorkOS role changes revoke sessions past ten pages and do not confirm a partial revocation',async()=>{
 const f=fixture();f.sessions.splice(0,1,...Array.from({length:13},(_,index)=>({id:'session_'+index,userId:'user_worker',status:'active'})));
 f.client.userManagement.listSessions=async(userId,{after}={})=>{const page=after?Number(after):0;return{data:[f.sessions[page]],listMetadata:page<12?{after:String(page+1)}:{}};};
 const adapter=await createWorkosStaffProvider({env,client:f.client});await adapter.users.getUser('workos:user_worker');
 await adapter.users.updateUserMetadata('workos:user_worker',{privateMetadata:{role:'customer'}});assert.equal(f.sessions.every(session=>session.status==='revoked'),true);
 await adapter.users.getUser('workos:user_worker');f.sessions[12].status='active';
 f.client.userManagement.revokeSession=async()=>{};
 await assert.rejects(adapter.users.updateUserMetadata('workos:user_worker',{privateMetadata:{role:'employee'}}),error=>error.code==='staff_reconciliation_required'&&error.providerWriteApplied===true);
 await assert.rejects(adapter.users.verifySessionsRevoked('workos:user_worker'),{code:'staff_reconciliation_required'});
 f.sessions[12].status='revoked';await adapter.users.verifySessionsRevoked('workos:user_worker');
});
test('WorkOS invitations explicitly grant ordinary member role and reject cross-organization revocation',async()=>{const f=fixture(),adapter=await createWorkosStaffProvider({env,client:f.client});const i=await adapter.invitations.createInvitation({emailAddress:'new@example.com',expiresInDays:7});assert.equal(i.id,'workos:invitation_fixture');assert.equal(f.writes[0].roleSlug,'member');assert.equal(f.writes[0].organizationId,'org_staff');f.invitations[0].organizationId='org_other';await assert.rejects(adapter.invitations.revokeInvitation(i.id),{code:'invalid_staff_request'});assert.equal(f.invitations[0].state,'pending');});
test('WorkOS staff changes reuse existing audit/idempotency flow and preserve uncertain post-write session failures',async()=>{const f=fixture(),repository=createMemoryRepository(),service=createStaffManagement({repository,env,client:f.client}),principal={userId:'workos:user_admin',role:'admin',admin:true,mfa:true,mfaEnrolled:true};const input={action:'staff-role',targetUserId:'workos:user_worker',expectedRole:'employee',role:'customer',requestKey:randomUUID(),confirmed:true};f.setFailRevoke(true);await assert.rejects(service.mutate(principal,input),{code:'staff_reconciliation_required'});assert.equal(f.memberships.user_worker.role.slug,'member');const state=await repository.transaction(s=>s);assert.ok(Object.values(state.audit).some(a=>a.action==='staff-change-uncertain'));assert.ok(!Object.values(state.audit).some(a=>a.action==='staff-change-rejected'));await assert.rejects(service.mutate(principal,input),{code:'staff_reconciliation_required'});assert.equal(f.writes.length,1);});
test('WorkOS staff management rejects self-promotion and replay creates only one ordinary invitation',async()=>{const f=fixture(),repository=createMemoryRepository(),service=createStaffManagement({repository,env,client:f.client}),principal={userId:'workos:user_admin',role:'admin',admin:true,mfa:true,mfaEnrolled:true};await assert.rejects(service.mutate(principal,{action:'staff-role',targetUserId:principal.userId,expectedRole:'admin',role:'customer',requestKey:randomUUID(),confirmed:true}),{code:'self_role_change'});const invite={action:'staff-invite',email:'new@example.com',requestKey:randomUUID(),confirmed:true};const result=await service.mutate(principal,invite);assert.deepEqual(await service.mutate(principal,invite),result);assert.equal(f.invitations.length,1);assert.equal(result.requiresPromotion,true);});
test('reconciliation cannot clear an uncertain WorkOS role change while sessions remain active',async()=>{
 const f=fixture(),repository=createMemoryRepository(),service=createStaffManagement({repository,env,client:f.client}),principal={userId:'workos:user_admin',role:'admin',admin:true,mfa:true,mfaEnrolled:true};
 const input={action:'staff-role',targetUserId:'workos:user_worker',expectedRole:'employee',role:'customer',requestKey:randomUUID(),confirmed:true};f.setFailRevoke(true);
 await assert.rejects(service.mutate(principal,input),{code:'staff_reconciliation_required'});
 const resolution={action:'staff-reconcile',targetRequestKey:input.requestKey,requestKey:randomUUID(),confirmed:true,note:'Reviewed intended role and all sessions in WorkOS.'};
 await assert.rejects(service.mutate(principal,resolution),{code:'staff_reconciliation_required'});
 assert.equal(await repository.transaction(state=>Object.values(state.audit).some(event=>event.action==='staff-change-confirmed')),false);
 f.sessions.forEach(session=>session.status='revoked');assert.equal((await service.mutate(principal,resolution)).reconciled,true);
 assert.equal(await repository.transaction(state=>Object.values(state.audit).filter(event=>event.action==='staff-change-confirmed').length),1);
});

test('WorkOS directory pagination and invitation filtering retain namespace and ordinary-role boundaries',async()=>{
 const f=fixture(),adapter=await createWorkosStaffProvider({env,client:f.client});
 const users=await adapter.users.getUserList({limit:1,offset:1,query:'worker@example.com'});assert.equal(users.totalCount,2);assert.equal(users.data[0].id,'workos:user_worker');
 const invited=await adapter.invitations.createInvitation({emailAddress:'new@example.com',expiresInDays:7});
 assert.equal((await adapter.invitations.getInvitationList({query:invited.id,status:'pending'})).totalCount,1);
 assert.equal((await adapter.invitations.getInvitationList({query:'new@example.com',status:'revoked'})).totalCount,0);
 assert.equal((await adapter.invitations.revokeInvitation(invited.id)).status,'revoked');
 assert.equal((await adapter.invitations.getInvitationList({limit:1,offset:0,status:'revoked'})).data[0].id,invited.id);
 await assert.rejects(adapter.invitations.revokeInvitation('invitation_fixture'),{code:'invalid_staff_request'});
 await assert.rejects(adapter.users.updateUserMetadata('workos:user_worker',{privateMetadata:{role:'owner'}}),{code:'invalid_staff_request'});
 for(const role of ['employee','admin','INVALID ROLE'])await assert.rejects(createWorkosStaffProvider({env:{...env,WORKOS_CUSTOMER_ROLE_SLUG:role},client:f.client}),{code:'staff_provider_unavailable'});
});

test('WorkOS directory refuses malformed provider data and ambiguous active memberships',async()=>{
 const f=fixture(),adapter=await createWorkosStaffProvider({env,client:f.client});
 f.client.userManagement.listUsers=async()=>({data:null});await assert.rejects(adapter.users.getUserList(),{code:'staff_provider_unavailable'});
 f.client.userManagement.listOrganizationMemberships=async()=>({data:[f.memberships.user_worker,{...f.memberships.user_worker,id:'om_duplicate'}]});
 await assert.rejects(adapter.users.getUser('workos:user_worker'),{code:'staff_provider_unavailable'});
 f.client.userManagement.listOrganizationMemberships=async()=>({data:[]});
 f.client.userManagement.getUser=async()=>({id:'user_other'});await assert.rejects(adapter.users.getUser('workos:user_worker'),{code:'invalid_staff_account'});
 f.client.userManagement.sendInvitation=async()=>({id:'invitation_fixture',organizationId:'org_staff',roleSlug:'admin'});
 await assert.rejects(adapter.invitations.createInvitation({emailAddress:'new@example.com'}),error=>error.providerWriteApplied===true&&!error.providerWriteNotStarted);
 f.client.userManagement.sendInvitation=async()=>({id:'malformed',organizationId:'org_staff'});
 await assert.rejects(adapter.invitations.createInvitation({emailAddress:'new@example.com'}),error=>error.code==='staff_provider_unavailable'&&error.providerWriteApplied===true);
});
