import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createMemoryRepository} from '../netlify/commerce/memory-repository.mjs';
import {createOperationsService} from '../netlify/operations/service.mjs';
import {createStaffManagement} from '../netlify/operations/staff-management.mjs';
import {operationsHttp} from '../netlify/operations/http.mjs';
import {requireStaff,permissionsFor} from '../netlify/operations/permissions.mjs';
const employee={userId:'user_employee',email:'employee@example.invalid',role:'employee',mfa:true,mfaEnrolled:true,sessionId:'session-employee'};
const admin={...employee,userId:'user_admin',role:'admin',admin:true,sessionId:'session-admin'};
const customer={...employee,userId:'user_customer',role:'customer',admin:false};
function setup(){
 const repository=createMemoryRepository({orders:{o1:{id:'o1',orderNumber:'DBM-ONE',status:'paid',customerEmail:'customer@example.invalid',customerUserId:'user_customer',shippingName:'<script>Not markup</script>',shippingAddress:{line1:'1 <b>Test</b> St',line2:'',city:'Example',state:'OH',postal_code:'00000',country:'US',private:'must omit'},createdAt:'2026-10-14T12:00:00Z',paidAt:'2026-10-14T12:00:00Z',fulfillmentStatus:'received',version:0,totalCents:11000,subtotalCents:11000,shippingCents:0,taxCents:0,sessionId:'cs_secret',paymentIntentId:'pi_private',requestKey:'secret',items:[{variantId:'tee-m',name:'Tee <img src=x>',size:'M',quantity:2,unitPriceCents:3000,lineTotalCents:6000},{variantId:'crew-l',name:'Crewneck',size:'L',quantity:1,unitPriceCents:5000,lineTotalCents:5000}]}}});
 const service=createOperationsService({repository,send:async()=>{}});return{repository,service};
}
test('customer and unenrolled/stale MFA staff cannot read queue or packing slips; denied attempts are audited',async()=>{
 const {repository,service}=setup();for(const actor of [customer,{...customer,admin:true},{...employee,mfa:false}]){
  await assert.rejects(service.read(actor,{staff:true}));await assert.rejects(service.mutate(actor,{action:'packing-slip',orderNumber:'DBM-ONE'}));
 }
 assert.equal(await repository.transaction(s=>Object.values(s.audit).filter(a=>a.action==='authorization-denied').length),6);
 assert.throws(()=>requireStaff({...employee,mfa:false}),{code:'mfa_required'});assert.equal(permissionsFor(customer).length,0);
});
test('employee queue reveals only fulfillment data and records stable actor/session identity',async()=>{
 const {repository,service}=setup();await repository.transaction(s=>{s.audit.note={id:'note',actor:'user_admin',action:'note',target:'DBM-ONE',metadata:{note:'PRIVATE ADMIN NOTE'},createdAt:'2026-10-14T12:00:00Z'};});
 const result=await service.read(employee,{staff:true,orderNumber:'DBM-ONE'}),text=JSON.stringify(result);
 for(const value of ['PRIVATE ADMIN NOTE','cs_secret','pi_private','totalCents','unitPriceCents','customerUserId','customer@example.invalid','must omit','session-employee'])assert.equal(text.includes(value),false,value);
 assert.equal(result.orders[0].shippingName,'<script>Not markup</script>');assert.deepEqual(result.orders[0].allowedTransitions,['making']);
 const events=await repository.transaction(s=>Object.values(s.audit));assert.ok(events.some(a=>a.action==='staff-order-opened'&&a.actor==='user_employee'&&/^[a-f0-9]{64}$/.test(a.metadata.sessionHash)));
});
test('administrator session audit handles missing IDs safely and deduplicates the actual actor session',async()=>{
 const {repository,service}=setup();await service.read({...admin,sessionId:undefined},{admin:true});
 assert.equal(await repository.transaction(s=>Object.values(s.audit).filter(a=>a.action==='admin-session').length),0);
 await service.read(admin,{admin:true});await service.read(admin,{admin:true});
 const events=await repository.transaction(s=>Object.values(s.audit));assert.equal(events.filter(a=>a.action==='admin-session').length,1);
 assert.equal(events.find(a=>a.action==='admin-session').metadata.sessionHash,events.find(a=>a.action==='staff-session').metadata.sessionHash);
});
test('employee cannot refund, reconcile, change stock or role, access admin notes, or apply fulfillment exceptions',async()=>{
 const {service}=setup();for(const action of ['refund','reconcile','inventory','staff-role','note','retry-email','support-status'])await assert.rejects(service.mutate(employee,{action}),{code:'admin_required'});
 await assert.rejects(service.read(employee,{admin:true}),{code:'admin_required'});
 await assert.rejects(service.mutate(employee,{action:'transition',orderNumber:'DBM-ONE',status:'cancelled',expectedVersion:0,confirmed:true,note:'Not allowed'}),{code:'admin_required'});
});
test('employee can fulfill, edit draft packages, and generate minimal split packing slips without over-allocation',async()=>{
 const {repository,service}=setup();for(const [expectedVersion,status]of ['making','packing'].entries())await service.mutate(employee,{action:'transition',orderNumber:'DBM-ONE',status,expectedVersion});
 const packageInput={action:'shipment',orderNumber:'DBM-ONE',carrier:'USPS',service:'Ground',trackingNumber:'TEST001',trackingUrl:'https://tools.usps.com/go/TrackConfirmAction',items:[{variantId:'tee-m',quantity:1}]};
 const a=await service.mutate(employee,packageInput),b=await service.mutate(employee,{...packageInput,trackingNumber:'TEST002',items:[{variantId:'tee-m',quantity:1},{variantId:'crew-l',quantity:1}]});
 await assert.rejects(service.mutate(employee,packageInput),{code:'over_allocated'});
 const update={action:'shipment-update',shipmentId:a.shipmentId,carrier:'UPS',service:'Ground',trackingNumber:'TEST003',trackingUrl:'https://www.ups.com/track',expectedVersion:0};
 await assert.rejects(service.mutate(employee,{...update,items:[{variantId:'tee-m',quantity:2}]}),{code:'over_allocated'});
 await service.mutate(employee,update);
 const first=await service.mutate(employee,{action:'packing-slip',orderNumber:'DBM-ONE',shipmentId:a.shipmentId}),second=await service.mutate(employee,{action:'packing-slip',orderNumber:'DBM-ONE',shipmentId:b.shipmentId});
 assert.deepEqual(first.packingSlip.items,[{name:'Tee <img src=x>',size:'M',quantity:1}]);assert.equal(second.packingSlip.items.length,2);assert.equal(second.packingSlip.items[0].quantity,1);
 assert.deepEqual(Object.keys(first.packingSlip).sort(),['brand','items','orderDate','orderNumber','packageNumber','shipTo','website'].sort());
 for(const value of ['o1','user_customer','cs_secret','pi_private','unitPriceCents','totalCents','variantId','must omit',a.shipmentId])assert.equal(JSON.stringify(first).includes(value),false,value);
 assert.equal(await repository.transaction(s=>Object.values(s.audit).filter(a=>a.action==='packing-slip-generated').length),2);
 await service.mutate(employee,{action:'transition',orderNumber:'DBM-ONE',status:'ready_to_ship',expectedVersion:2});
 await service.mutate(employee,{action:'shipment-status',shipmentId:a.shipmentId,status:'packed',expectedVersion:1});await service.mutate(employee,{action:'shipment-status',shipmentId:a.shipmentId,status:'shipped',expectedVersion:2});
 await assert.rejects(service.mutate(employee,{action:'shipment-status',shipmentId:a.shipmentId,status:'delivered',expectedVersion:3}),{code:'confirmation_required'});
 await service.mutate(employee,{action:'shipment-status',shipmentId:a.shipmentId,status:'delivered',expectedVersion:3,confirmed:true});
 assert.equal(await repository.transaction(s=>s.shipments[a.shipmentId].status),'delivered');
});
test('packing slip rejects wrong-order package binding, corrupt allocation, and customer HTTP access',async()=>{
 const {repository,service}=setup();await repository.transaction(s=>{s.shipments.p={id:'p',orderId:'other',packageNumber:'PKG-TEST',items:[{variantId:'tee-m',quantity:1}]};s.shipmentItems.i={id:'i',shipmentId:'p',variantId:'tee-m',quantity:3};});
 await assert.rejects(service.mutate(employee,{action:'packing-slip',orderNumber:'DBM-ONE',shipmentId:'p'}),{code:'not_found'});
 await repository.transaction(s=>{s.shipments.p.orderId='o1';});await assert.rejects(service.mutate(employee,{action:'packing-slip',orderNumber:'DBM-ONE',shipmentId:'p'}),{code:'invalid_package'});
 const origin='https://garage.example',body=JSON.stringify({action:'packing-slip',orderNumber:'DBM-ONE',role:'employee'});
 const result=await operationsHttp(new Request(origin+'/api/operations/me',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body}),{env:{SITE_ORIGIN:origin},runtime:async()=>({repository}),auth:async()=>customer});assert.equal(result.status,404);assert.equal(JSON.stringify(await result.json()).includes('shipping'),false);
});
test('packing slips reject refunded, cancelled and held orders for both staff roles without generating audit evidence',async()=>{
 for(const state of [{status:'pending'},{status:'refunded'},{fulfillmentStatus:'cancelled'},{fulfillmentStatus:'on_hold'}]){
  const {repository,service}=setup();await repository.transaction(s=>{Object.assign(s.orders.o1,state);s.shipments.p={id:'p',orderId:'o1',packageNumber:'PKG-TEST'};s.shipmentItems.i={id:'i',shipmentId:'p',variantId:'tee-m',quantity:1};});
  for(const actor of [employee,admin])for(const packageFields of [{},{shipmentId:'p'}])await assert.rejects(service.mutate(actor,{action:'packing-slip',orderNumber:'DBM-ONE',...packageFields}),{code:'not_ready'});
  assert.equal(await repository.transaction(s=>Object.values(s.audit).filter(a=>a.action==='packing-slip-generated').length),0);
 }
});
function providerSetup(){
 const {repository}=setup();const users={user_admin:{id:'user_admin',privateMetadata:{role:'admin'},twoFactorEnabled:true},user_target:{id:'user_target',firstName:'Target',primaryEmailAddressId:'e1',emailAddresses:[{id:'e1',emailAddress:'target@example.invalid',verification:{status:'verified'}}],privateMetadata:{},twoFactorEnabled:true}};
 let writes=0;const invitations=[];
 const client={users:{getUser:async id=>structuredClone(users[id]),updateUserMetadata:async(id,{privateMetadata})=>{writes++;Object.assign(users[id].privateMetadata,privateMetadata);return structuredClone(users[id]);},getUserList:async()=>({data:Object.values(users),totalCount:2})},invitations:{createInvitation:async params=>{writes++;assert.equal(params.publicMetadata,undefined);assert.equal(params.ignoreExisting,false);const invitation={id:'inv_test',emailAddress:params.emailAddress,status:'pending'};invitations.push(invitation);return invitation;},getInvitationList:async()=>({data:invitations}),revokeInvitation:async id=>({id,status:'revoked'})}};
 return{repository,users,client,invitations,writes:()=>writes,service:createStaffManagement({repository,client,env:{SITE_ORIGIN:'https://garage.example'}})};
}
test('only recent-MFA admins can invite/promote/revoke; private metadata grant is confirmed, audited and idempotent',async()=>{
 const f=providerSetup(),input={action:'staff-role',targetUserId:'user_target',role:'employee',expectedRole:'customer',requestKey:randomUUID(),confirmed:true};
 await assert.rejects(f.service.mutate(employee,input),{code:'admin_required'});await assert.rejects(f.service.mutate({...admin,mfa:false},input),{code:'mfa_required'});
 const result=await f.service.mutate(admin,input);assert.equal(result.member.role,'employee');await f.service.mutate(admin,input);assert.equal(f.writes(),1);
 assert.equal(f.users.user_target.privateMetadata.staffAccess.grantedBy,'user_admin');assert.equal(await f.repository.transaction(s=>Object.values(s.audit).filter(a=>a.action==='staff-change-confirmed').length),1);
 await f.service.mutate(admin,{...input,requestKey:randomUUID(),role:'customer',expectedRole:'employee'});assert.ok(f.users.user_target.privateMetadata.staffAccess.revokedAt);
 await assert.rejects(f.service.mutate(admin,{...input,targetUserId:'user_admin',requestKey:randomUUID()}),{code:'self_role_change'});
});
test('staff invitations do not grant roles or use public metadata; promotion requires verified email and MFA',async()=>{
 const f=providerSetup(),invite={action:'staff-invite',email:'target@example.invalid',requestKey:randomUUID(),confirmed:true};const result=await f.service.mutate(admin,invite);assert.equal(result.requiresPromotion,true);assert.equal(f.users.user_target.privateMetadata.role,undefined);
 const request={action:'staff-role',targetUserId:'user_target',role:'employee',expectedRole:'customer',requestKey:randomUUID(),confirmed:true};
 f.users.user_target.twoFactorEnabled=false;await assert.rejects(f.service.mutate(admin,request),{code:'staff_enrollment_required'});assert.equal(f.writes(),1);
 f.users.user_target.twoFactorEnabled=true;f.users.user_target.emailAddresses[0].verification.status='unverified';await assert.rejects(f.service.mutate(admin,{...request,requestKey:randomUUID()}),{code:'staff_enrollment_required'});
});
test('uncertain role mutation fails closed, records review state, and cannot repeat or allow a conflicting staff write',async()=>{
 const f=providerSetup();f.client.users.updateUserMetadata=async()=>{throw new Error('secret provider diagnostics');};
 const request={action:'staff-role',targetUserId:'user_target',role:'employee',expectedRole:'customer',requestKey:randomUUID(),confirmed:true};await assert.rejects(f.service.mutate(admin,request),error=>error.code==='staff_reconciliation_required'&&!error.message.includes('secret'));
 await assert.rejects(f.service.mutate(admin,request),{code:'staff_reconciliation_required'});await assert.rejects(f.service.mutate(admin,{...request,requestKey:randomUUID()}),{code:'staff_reconciliation_required'});
 assert.equal(await f.repository.transaction(s=>Object.values(s.audit).filter(a=>a.action==='staff-change-uncertain').length),1);
});

test('administrator reconciles an uncertain role only after Clerk confirms it, without repeating the write',async()=>{
 const f=providerSetup();f.client.users.updateUserMetadata=async()=>{throw new Error('ambiguous transport failure');};
 const request={action:'staff-role',targetUserId:'user_target',role:'employee',expectedRole:'customer',requestKey:randomUUID(),confirmed:true};
 await assert.rejects(f.service.mutate(admin,request),{code:'staff_reconciliation_required'});
 const resolution={action:'staff-reconcile',targetRequestKey:request.requestKey,requestKey:randomUUID(),confirmed:true,note:'Reviewed the intended role in Clerk.'};
 await assert.rejects(f.service.mutate(employee,resolution),{code:'admin_required'});
 await assert.rejects(f.service.mutate(admin,resolution),{code:'staff_reconciliation_required'});
 assert.equal((await f.service.read(admin)).unresolved.length,1);
 f.users.user_target.privateMetadata.role='employee';
 assert.equal((await f.service.mutate(admin,resolution)).result.member.role,'employee');
 assert.equal((await f.service.mutate(admin,resolution)).reconciled,true);
 assert.equal((await f.service.read(admin)).unresolved.length,0);
 assert.equal((await f.service.mutate(admin,request)).member.role,'employee');
 assert.equal(f.writes(),0);
 assert.equal(await f.repository.transaction(s=>Object.values(s.audit).filter(a=>a.action==='staff-change-confirmed'&&a.metadata.reconciled).length),1);
});

test('uncertain invitations reconcile only to a unique provider-confirmed outcome',async()=>{
 const f=providerSetup();f.client.invitations.createInvitation=async()=>{throw Error('network failure');};
 const request={action:'staff-invite',email:'new@example.invalid',requestKey:randomUUID(),confirmed:true};
 await assert.rejects(f.service.mutate(admin,request),{code:'staff_reconciliation_required'});
 const resolve={action:'staff-reconcile',targetRequestKey:request.requestKey,requestKey:randomUUID(),confirmed:true,note:'Reviewed invitation in the provider.'};
 await assert.rejects(f.service.mutate(admin,resolve),{code:'staff_reconciliation_required'});
 const invitation={id:'inv_confirmed',emailAddress:request.email,status:'pending',createdAt:Date.now()};f.invitations.push(invitation,{...invitation,id:'inv_duplicate'});
 await assert.rejects(f.service.mutate(admin,resolve),{code:'staff_reconciliation_required'});
 f.invitations.pop();assert.equal((await f.service.mutate(admin,resolve)).result.invitationId,'inv_confirmed');assert.equal(f.writes(),0);
 f.client.invitations.revokeInvitation=async()=>{throw Error('network failure');};
 const revoke={action:'staff-revoke-invitation',invitationId:invitation.id,requestKey:randomUUID(),confirmed:true};
 await assert.rejects(f.service.mutate(admin,revoke),{code:'staff_reconciliation_required'});
 const resolution={...resolve,targetRequestKey:revoke.requestKey,requestKey:randomUUID()};await assert.rejects(f.service.mutate(admin,resolution),{code:'staff_reconciliation_required'});
 invitation.status='revoked';assert.equal((await f.service.mutate(admin,resolution)).result.status,'revoked');
});

test('a successful role write followed by a failed confirmation read remains uncertain',async()=>{
 const f=providerSetup(),get=f.client.users.getUser;let written=false;
 f.client.users.updateUserMetadata=async(id,{privateMetadata})=>{Object.assign(f.users[id].privateMetadata,privateMetadata);written=true;};
 f.client.users.getUser=async id=>{if(written&&id==='user_target')throw Object.assign(Error('not found'),{status:404});return get(id);};
 const request={action:'staff-role',targetUserId:'user_target',role:'employee',expectedRole:'customer',requestKey:randomUUID(),confirmed:true};
 await assert.rejects(f.service.mutate(admin,request),{code:'staff_reconciliation_required'});
 assert.equal(await f.repository.transaction(s=>Object.values(s.audit).filter(a=>a.action==='staff-change-rejected').length),0);
 assert.equal(await f.repository.transaction(s=>Object.values(s.audit).filter(a=>a.action==='staff-change-uncertain').length),1);
});
