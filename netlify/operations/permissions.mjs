export class AuthError extends Error {
  constructor(code,message,status=401){super(message);this.name='AuthError';Object.assign(this,{code,status});}
}
export const roles=Object.freeze(['customer','employee','admin']);
const grants=Object.freeze({customer:Object.freeze([]),employee:Object.freeze(['staff-read','fulfillment','packing-slip']),admin:Object.freeze(['staff-read','fulfillment','packing-slip','administration','staff-management'])});
// Only server-created principals reach services. Legacy admin fixtures have no role;
// authenticate() sets an explicit role from a fresh server-side provider record.
export const roleOf=principal=>roles.includes(principal?.role)?principal.role:principal?.role===undefined&&principal?.admin===true?'admin':'customer';
export const permissionsFor=principal=>[...grants[roleOf(principal)]];
export function requireMfa(principal){
  if(!principal?.mfa){const error=new AuthError('mfa_required','Sign in to the staff organization and complete its required authenticator verification.',403);error.reverify=principal?.mfaEnrolled===true;throw error;}
  return principal;
}
export function requireAdmin(principal){
  if(roleOf(principal)!=='admin')throw new AuthError('admin_required','Administrator access is required.',403);
  return requireMfa(principal);
}
export function requireStaff(principal){
  if(!['employee','admin'].includes(roleOf(principal)))throw new AuthError('staff_required','Not found.',404);
  return requireMfa(principal);
}
export function requireFreshMfa(principal){
  requireMfa(principal);
  if(principal.mfaFresh!==true){const error=new AuthError('step_up_required','Verify your sign-in again before this sensitive change. Nothing was changed.',403);error.reverify=true;throw error;}
  return principal;
}
export function requirePermission(principal,permission,{fresh=false}={}){
  if(!grants[roleOf(principal)].includes(permission)){
    if(['administration','staff-management'].includes(permission))return requireAdmin(principal);
    throw new AuthError('staff_required','Not found.',404);
  }
  return fresh?requireFreshMfa(principal):requireMfa(principal);
}
export const staffActions=Object.freeze(['transition','shipment','shipment-update','shipment-status','packing-slip']);
export const employeeTransitions=Object.freeze(['making','packing','ready_to_ship']);
