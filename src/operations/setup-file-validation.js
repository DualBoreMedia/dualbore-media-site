// Common client preflight for private MX Bikes setup uploads. Mirrors the
// server's size and filename rules; do not change those server-side checks.
// A browser check is helpful feedback only, never authentication or validation
// of the embedded bike identity, file signature, compatibility or entitlements.
export const SETUP_FILE_MAX_BYTES=2*1024*1024;
export const SETUP_FILE_MIN_BYTES=48;
export const SETUP_FILE_MESSAGE='Choose a supported .stp file, no larger than 2 MB, with a simple filename.';
export function validateSetupFileChoice(file){
 if(!file||!Number.isSafeInteger(file.size)||file.size<SETUP_FILE_MIN_BYTES||file.size>SETUP_FILE_MAX_BYTES||typeof file.name!=='string'||!/^[A-Za-z0-9][A-Za-z0-9 ._()-]{0,119}\.stp$/i.test(file.name))return SETUP_FILE_MESSAGE;
 return null;
}
