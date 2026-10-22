// Server-only compatibility adapter. This metadata shape is created from fresh
// WorkOS API records, never from user-editable metadata or browser claims.
import {CommerceError} from '../commerce/service.mjs';
import {workosClient,workosConfig} from './workos-auth.mjs';
import {allWorkosPages} from './workos-pagination.mjs';
const namespace='workos:';
const rawUser=id=>{if(!/^workos:user_[A-Za-z0-9]+$/.test(id||''))throw new CommerceError('invalid_staff_account','Choose a WorkOS account.',400);return id.slice(namespace.length);};
const rawInvitation=id=>{if(!/^workos:invitation_[A-Za-z0-9]+$/.test(id||''))throw new CommerceError('invalid_staff_request','Choose a WorkOS invitation.',400);return id.slice(namespace.length);};
const failure=(code,message,status=409)=>{const error=new CommerceError(code,message,status);error.providerWriteNotStarted=true;throw error;};
async function all(fetchPage){try{return await allWorkosPages(fetchPage);}catch{throw new CommerceError('staff_provider_unavailable','The account directory could not be fully verified. Review it in WorkOS.',503);}}
export async function createWorkosStaffProvider({env=process.env,client}={}){
 workosConfig(env);if(!/^org_[A-Za-z0-9]+$/.test(env.WORKOS_STAFF_ORGANIZATION_ID||'')||env.WORKOS_STAFF_MFA_POLICY_VERIFIED!=='true')failure('staff_provider_unavailable','Verify the staff organization MFA policy before managing access.',503);
 const customerRole=env.WORKOS_CUSTOMER_ROLE_SLUG||'member';if(['employee','admin'].includes(customerRole)||!/^[-a-z0-9_]{1,64}$/.test(customerRole))failure('staff_provider_unavailable','Configure an ordinary invitation role.',503);
 const c=client||await workosClient(env),api=c.userManagement,org=env.WORKOS_STAFF_ORGANIZATION_ID,observed=new Map();
 async function membership(id){const result=await all(options=>api.listOrganizationMemberships({organizationId:org,userId:id,...options}));const rows=result.filter(m=>m.organizationId===org&&m.userId===id&&m.status==='active');if(rows.length>1)failure('staff_provider_unavailable','Membership lookup is ambiguous.',503);return rows[0];}
 async function verifySessionsRevoked(id){const raw=rawUser(id),sessions=await all(options=>api.listSessions(raw,{...options,order:'desc'}));if(sessions.some(session=>session.userId!==raw||session.status==='active'))throw new CommerceError('staff_reconciliation_required','Active sessions remain. Complete session revocation in WorkOS before confirming this change.',409);}
 const role=m=>['employee','admin'].includes(m?.role?.slug)?m.role.slug:'customer';
 async function user(id){const raw=rawUser(id);const[u,m,factors]=await Promise.all([api.getUser(raw),membership(raw),c.multiFactorAuth.listUserAuthFactors({userId:raw,limit:100})]);if(u.id!==raw)failure('invalid_staff_account','The account could not be verified.');observed.set(id,{id:m?.id,role:role(m)});return {id,firstName:u.firstName,lastName:u.lastName,primaryEmailAddressId:'primary',emailAddresses:[{id:'primary',emailAddress:u.email,verification:{status:u.emailVerified?'verified':'unverified'}}],twoFactorEnabled:factors.data.some(f=>f.userId===raw&&f.type==='totp'),privateMetadata:{role:role(m),staffAccess:{grantedAt:role(m)!=='customer'?m.updatedAt:null}},createdAt:Date.parse(u.createdAt)||null};}
 const invitation=i=>{if(i.organizationId!==org)failure('invalid_staff_request','The invitation belongs to another organization.');if(!/^invitation_[A-Za-z0-9]+$/.test(i.id))failure('staff_provider_unavailable','The invitation could not be verified.',503);return {id:namespace+i.id,emailAddress:i.email,status:i.state,createdAt:Date.parse(i.createdAt),role:role({role:{slug:i.roleSlug}})};};
 return {
  users:{getUser:user,verifySessionsRevoked,
   async getUserList({limit=100,offset=0,query}={}){const result=await all(options=>api.listUsers({...options,...query?{email:query}:{organizationId:org}}));return {data:await Promise.all(result.slice(offset,offset+limit).map(u=>user(namespace+u.id))),totalCount:result.length};},
   async updateUserMetadata(id,{privateMetadata}={}){
    const desired=privateMetadata?.role;if(!['customer','employee','admin'].includes(desired))failure('invalid_staff_request','Choose an allowed staff role.',400);
    const raw=rawUser(id),previous=observed.get(id),current=await membership(raw);
    if(!current||!previous||current.id!==previous.id||role(current)!==previous.role)failure('stale_role','Membership changed. Reload before saving.');
    if(desired!=='customer'){const u=await api.getUser(raw),f=await c.multiFactorAuth.listUserAuthFactors({userId:raw,limit:100});if(!u.emailVerified||!f.data.some(x=>x.userId===raw&&x.type==='totp'))failure('staff_enrollment_required','Verify the account email and enroll MFA first.');}
    let applied=false;try{
     const changed=await api.updateOrganizationMembership(current.id,{roleSlug:desired==='customer'?customerRole:desired});applied=true;
     if(changed.id!==current.id||changed.organizationId!==org||changed.userId!==raw||changed.status!=='active'||role(changed)!==desired)throw Error('Unconfirmed membership');
     // Role changes always invalidate old provider sessions, including promotions.
     const sessions=await all(options=>api.listSessions(raw,{...options,order:'desc'}));for(const session of sessions){if(session.userId!==raw)throw Error('Unconfirmed session ownership');if(session.status==='active')await api.revokeSession({sessionId:session.id});}
     await verifySessionsRevoked(id);
    }catch(error){if(applied)error.providerWriteApplied=true;throw error;}
   }},
  invitations:{
   async createInvitation({emailAddress,expiresInDays}){const result=await api.sendInvitation({email:emailAddress,organizationId:org,expiresInDays,roleSlug:customerRole});try{const mapped=invitation(result);if(mapped.role!=='customer')throw Error('Privileged invitation rejected');return mapped;}catch(error){delete error.providerWriteNotStarted;error.providerWriteApplied=true;throw error;}},
   async revokeInvitation(id){const raw=rawInvitation(id);invitation(await api.getInvitation(raw));return invitation(await api.revokeInvitation(raw));},
   async getInvitationList({limit=100,offset=0,query,status}={}){let rows;if(query?.startsWith(namespace)){rows=[await api.getInvitation(rawInvitation(query))];}else rows=await all(options=>api.listInvitations({...options,organizationId:org,...query?{email:query}:{}}));const mapped=rows.map(invitation).filter(i=>!status||i.status===status);return {data:mapped.slice(offset,offset+limit),totalCount:mapped.length};}
  }
 };
}
