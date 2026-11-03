import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadEnv} from 'vite';
export function accountPolicy(frontendOrigin){
 const origin=new URL(frontendOrigin);if(origin.origin!==frontendOrigin||origin.protocol!=='https:'||origin.username||origin.password||origin.port||!/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(origin.hostname))throw new Error('Configure the exact HTTPS Clerk frontend origin.');
 // Vendor challenge origins are narrowly scoped. Inline styles are required by
 // Clerk's prebuilt components; inline scripts and eval remain prohibited.
 return `default-src 'self'; script-src 'self' ${origin.origin} https://challenges.cloudflare.com https://*.protect.clerk.com; connect-src 'self' ${origin.origin} https://*.protect.clerk.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://img.clerk.com; frame-src https://challenges.cloudflare.com https://*.protect.clerk.com; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`;
}
export function monitoringOrigin(dsn){
 const url=new URL(dsn);
 if(url.protocol!=='https:'||url.password||url.port||!/^([a-z0-9-]+\.)*ingest(?:\.[a-z]+)?\.sentry\.io$/i.test(url.hostname)||!/^\/\d+$/.test(url.pathname)||url.search||url.hash)throw new Error('Configure an official HTTPS Sentry ingest DSN.');
 return url.origin;
}
export async function prepareHeaders(env=process.env){
 const source=await readFile('public/_headers','utf8');
 let output=source;
 if(env.AUTH_PROVIDER==='clerk'&&env.CLERK_FRONTEND_ORIGIN){const policy=accountPolicy(env.CLERK_FRONTEND_ORIGIN);for(const route of ['/account','/account/*','/admin','/admin/*','/staff','/staff/*','/shop','/order/*'])output+=`\n${route}\n  Cache-Control: no-store\n  Content-Security-Policy: ${policy}\n`;}
 if(env.VITE_ERROR_MONITORING_ENABLED==='true'){
  const origin=monitoringOrigin(env.VITE_SENTRY_DSN);
  output=output.replace(/connect-src ([^;\n]+)/g,(_,sources)=>`connect-src ${sources} ${origin}`);
 }
 await writeFile('dist/client/_headers',output);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await prepareHeaders({...loadEnv('production',process.cwd(),''),...process.env});
