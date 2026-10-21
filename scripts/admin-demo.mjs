import {createServer,transformWithEsbuild} from 'vite';
import react from '@vitejs/plugin-react';
import pg from 'pg';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {pathToFileURL} from 'node:url';
import {createPostgresRepository,runMigrations} from '../netlify/commerce/repository.mjs';
import {createOperationsService} from '../netlify/operations/service.mjs';
import {createStaffManagement} from '../netlify/operations/staff-management.mjs';
import {demoSeed,demoIdentity} from './admin-demo-data.mjs';

export function assertDemoEnvironment(env=process.env){
 if(env.NETLIFY||env.VERCEL||env.CONTEXT||env.NODE_ENV==='production'||env.COMMERCE_ENVIRONMENT==='production')throw Error('Admin demo refuses hosted or production execution.');
}
export function assertDemoDatabase(value){
 const u=new URL(value);if(!['postgres:','postgresql:'].includes(u.protocol)||u.hostname!=='127.0.0.1'||u.port!=='55432'||u.pathname!=='/dbm_sandbox'||u.search||u.hash)throw Error('Admin demo requires the isolated loopback dbm_sandbox on port 55432.');return value;
}
export function demoProviders(){
 const users=new Map(['admin','employee','customer'].map(role=>{const p=demoIdentity(role);return [p.userId,{id:p.userId,firstName:'Synthetic',lastName:role,primaryEmailAddressId:'email',emailAddresses:[{id:'email',emailAddress:p.email,verification:{status:'verified'}}],twoFactorEnabled:role!=='customer',privateMetadata:{role},createdAt:Date.now()}];}));
 const invitations=new Map(),refunds=new Map();
 const client={users:{getUser:async id=>{if(!users.has(id))throw Error('Unknown synthetic user');return structuredClone(users.get(id));},getUserList:async()=>({data:[...users.values()].map(x=>structuredClone(x)),totalCount:users.size}),updateUserMetadata:async(id,{privateMetadata})=>{const u=users.get(id);if(!u)throw Error('Unknown synthetic user');u.privateMetadata={...u.privateMetadata,...privateMetadata};return structuredClone(u);}},sessions:{getSessionList:async()=>({data:[]}),revokeSession:async()=>({status:'revoked'})},invitations:{getInvitationList:async()=>({data:[...invitations.values()]}),createInvitation:async({emailAddress})=>{if(!emailAddress.endsWith('@example.invalid'))throw Object.assign(Error('Use a synthetic @example.invalid address.'),{status:400});const i={id:'inv_'+randomBytes(8).toString('hex'),emailAddress,status:'pending',createdAt:Date.now()};invitations.set(i.id,i);return i;},revokeInvitation:async id=>{const i=invitations.get(id);if(!i)throw Error('Unknown synthetic invitation');i.status='revoked';return i;}}};
 const stripe={paymentIntents:{retrieve:async id=>{if(!/^pi_demo_\d+$/.test(id))throw Error('Only demo payments exist here');return {id,livemode:false,currency:'usd',status:'succeeded'};}},refunds:{create:async(p,{idempotencyKey})=>{if(!refunds.has(idempotencyKey))refunds.set(idempotencyKey,{id:'re_Demo'+randomBytes(8).toString('hex'),payment_intent:p.payment_intent,amount:p.amount,currency:'usd',status:'succeeded'});return refunds.get(idempotencyKey);}},checkout:{sessions:{retrieve:async()=>({payment_status:'unpaid',status:'open'})}}};
 return {users,client,stripe};
}

export async function postgresDemoFactory(connectionString){
 assertDemoDatabase(connectionString);const control=new pg.Pool({connectionString});
 return async()=>{
  const schema='dbm_admin_demo_'+randomBytes(8).toString('hex');await control.query('CREATE SCHEMA '+schema);
  const pool=new pg.Pool({connectionString,options:'-c search_path='+schema,max:4});
  try{await runMigrations(pool);}catch(e){await pool.end();await control.query('DROP SCHEMA '+schema+' CASCADE');throw e;}
  return {repository:createPostgresRepository(pool),database:'Isolated local PostgreSQL / synthetic schema',close:async()=>{await pool.end();await control.query('DROP SCHEMA '+schema+' CASCADE');},shutdown:()=>control.end()};
 };
}

export async function startAdminDemo({port=4330,repositoryFactory,env=process.env}={}){
 assertDemoEnvironment(env);if(!Number.isInteger(port)||port<1024||port>65535||typeof repositoryFactory!=='function')throw Error('Configure a loopback demo port and isolated repository factory.');
 const origin=`http://127.0.0.1:${port}`,token=randomBytes(32).toString('hex');let generation=0,role='admin',session='active',current,providers,service,staff;
 async function reset(){
  const next=await repositoryFactory();let prepared;
  try{const seed=demoSeed();await next.repository.transaction(s=>Object.assign(s,seed.state));const nextProviders=demoProviders(),sandboxEnv={...seed.env,SITE_ORIGIN:origin};prepared={providers:nextProviders,service:createOperationsService({repository:next.repository,env:sandboxEnv,stripe:nextProviders.stripe,send:async()=>({status:'disabled'}),retryEmail:async()=>({status:'disabled'})}),staff:createStaffManagement({repository:next.repository,env:sandboxEnv,client:nextProviders.client})};}catch(error){await next.close();throw error;}
  const previous=current;current=next;({providers,service,staff}=prepared);role='admin';session='active';generation++;await previous?.close();
 }
 await reset();
 const info=()=>({generation,role,session,database:current.database||'Synthetic memory test fixture',shipping:'5 business days; weekends/illustrative holidays excluded. Final owner calendar not configured.',realAuth:false});
 const principal=()=>{if(session==='revoked')return null;const p=demoIdentity(role),u=providers.users.get(p.userId);return {...p,role:u.privateMetadata.role,admin:u.privateMetadata.role==='admin',mfa:session!=='expired'&&u.twoFactorEnabled};};
 const clientSource=`import React,{useEffect,useState} from 'react';import {createRoot} from 'react-dom/client';import OperationsApp from '/src/operations/OperationsApp.jsx';import StaffApp from '/src/operations/StaffApp.jsx';import '/src/styles.css';
const token=${JSON.stringify(token)};const request=(path,body)=>fetch(path,{method:body?'POST':'GET',headers:{'X-Demo-Token':token,...body?{'Content-Type':'application/json'}:{}},...body?{body:JSON.stringify(body)}:{}}).then(async r=>{const j=await r.json();if(!r.ok)throw Error(j.error||'Demo request failed');return j;});
function Demo(){const [meta,setMeta]=useState(null),[error,setError]=useState('');const load=()=>request('/__demo/meta').then(setMeta).catch(e=>setError(e.message));useEffect(()=>{load();},[]);const change=async body=>{try{setMeta(await request('/__demo/control',body));setError('');}catch(e){setError(e.message);}};if(!meta)return <main><h1>Preparing local demo</h1><p>{error}</p></main>;const auth={isLoaded:true,isSignedIn:meta.session!=='revoked',getToken:async()=> 'DEMO-ONLY-NOT-A-REAL-TOKEN',fetcher:(url,options)=>fetch('/__demo/operations'+url.slice('/api/operations'.length),{...options,headers:{...options.headers,'X-Demo-Token':token}}),signOut:()=>change({session:'revoked'}),signInElement:<p>Demo session revoked. Use Restore session above. This is not WorkOS authentication.</p>};const view=location.pathname.split('/').at(-1);return <><aside className="demo-banner"><strong>TEST / DEMO: NO REAL ORDERS</strong><p>Local PostgreSQL practice. No Stripe calls, emails, shipments or WorkOS login. Use only synthetic data.</p><nav><a href="/__demo/admin">Admin dashboard</a><a href="/__demo/staff">Staff / Employees</a><a href="/__demo/customer">Customer account</a></nav><label>Practice role <select value={meta.role} onChange={e=>change({role:e.target.value})}><option value="admin">Synthetic administrator</option><option value="employee">Synthetic employee</option><option value="customer">Synthetic customer</option></select></label><button onClick={()=>change({session:'expired'})}>Expire MFA</button><button onClick={()=>change({session:'revoked'})}>Revoke session</button><button onClick={()=>change({session:'active'})}>Restore session</button><button onClick={()=>{if(confirm('Reset all synthetic practice data? Real accounts and production are not involved.'))change({reset:true});}}>Reset demo orders</button><p>{meta.database}. {meta.shipping} Session: {meta.session}. Changes survive page refresh; stopping this demo discards its schema.</p>{error&&<p role="alert">{error}</p>}</aside><div key={meta.generation+'-'+meta.role+'-'+meta.session}>{view==='staff'?<StaffApp auth={auth}/>:<OperationsApp admin={view!=='customer'} auth={auth}/>}</div></>;}
createRoot(document.getElementById('root')).render(<Demo/>);`;
 const reply=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));};
 let controlQueue=Promise.resolve();
 const server=await createServer({cacheDir:'.tools/cache/admin-demo-'+port,configFile:false,envDir:false,mode:'test',define:{__APP_RELEASE__:JSON.stringify('local-admin-demo'),__APP_ENVIRONMENT__:JSON.stringify('test')},server:{host:'127.0.0.1',port,strictPort:true,cors:false,fs:{strict:true,deny:['.env','**/.env*','**/.git/**',process.cwd().replaceAll('\\','/')+'/.tools/**']}},plugins:[react(),{name:'localhost-admin-practice-only',resolveId:id=>id==='/__demo-client.jsx'?'\0__demo-client.jsx':null,load:async id=>id==='\0__demo-client.jsx'?(await transformWithEsbuild(clientSource,'admin-demo.jsx',{loader:'jsx',jsx:'automatic'})).code:null,configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
  if(req.headers.host!==`127.0.0.1:${port}`||!['127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)){reply(res,403,{error:'Loopback demo only.'});return;}
  const url=new URL(req.url,origin),path=url.pathname;
  if(['/','/admin','/staff','/account'].includes(path)){const target=path==='/staff'?'staff':path==='/account'?'customer':'admin';res.writeHead(302,{Location:'/__demo/'+target});res.end();return;}
  if(['/__demo/admin','/__demo/staff','/__demo/customer'].includes(path)&&req.method==='GET'){
   const html=await vite.transformIndexHtml(path,'<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>DualBore Media Admin Demo | No real orders</title><link rel="icon" href="/assets/favicon.svg"><style>.demo-banner{position:relative;z-index:10;padding:18px;background:#15212b;border-bottom:3px solid #00f0ff;color:#fff;font:14px system-ui}.demo-banner strong{color:#00f0ff}.demo-banner nav{display:flex;gap:18px;flex-wrap:wrap;margin:12px 0}.demo-banner button,.demo-banner select{min-height:48px;margin:5px;padding:8px 12px;background:#232834;color:#fff;border:1px solid #778194;border-radius:4px}.demo-banner a{color:#00f0ff;text-decoration:underline}.demo-banner p{max-width:1100px;line-height:1.5}</style></head><body style="margin:0"><div id="root"></div><script type="module" src="/__demo-client.jsx"></script></body></html>');res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer'});res.end(html);return;
  }
  // This server has no route to real payment, email or authentication handlers.
  if(path.startsWith('/api/')){reply(res,404,{error:'Real service endpoints are not mounted in the practice server.'});return;}
  if(!path.startsWith('/__demo/')){next();return;}
  if(req.headers['x-demo-token']!==token||req.method==='POST'&&req.headers.origin!==origin){reply(res,403,{error:'Open this local demo page before making changes.'});return;}
  try{
   if(path==='/__demo/meta'&&req.method==='GET'){reply(res,200,info());return;}
   if(!['GET','POST'].includes(req.method)){reply(res,405,{error:'Use the demo controls.'});return;}
   let body;if(req.method==='POST'){let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>8192){reply(res,413,{error:'Demo request too large.'});return;}chunks.push(chunk);}body=JSON.parse(Buffer.concat(chunks).toString());}
   if(path==='/__demo/control'&&req.method==='POST'){
    if(!body||Object.keys(body).length!==1||!(body.reset===true||['admin','employee','customer'].includes(body.role)||['active','expired','revoked'].includes(body.session))){reply(res,400,{error:'Choose a demo control.'});return;}
    const apply=async()=>{if(body.reset)await reset();else if(body.role)role=body.role;else session=body.session;return info();};const pending=controlQueue.then(apply);controlQueue=pending.catch(()=>{});reply(res,200,await pending);return;
   }
   if(path!=='/__demo/operations'){reply(res,404,{error:'No demo endpoint here.'});return;}
   await controlQueue;const p=principal();if(!p){reply(res,401,{code:'unauthorized'});return;}
   const q=Object.fromEntries(url.searchParams);for(const k of ['admin','staff','staffManagement'])q[k]=q[k]==='true';
   const management=body?.action?.startsWith('staff-')||q.staffManagement;
   const result=req.method==='POST'?await(management?staff:service).mutate(p,body):await(management?staff:service).read(p,q);reply(res,200,result);
  }catch(e){reply(res,Number.isInteger(e.status)?e.status:503,{code:e.code||'demo_unavailable',error:e.code?'This synthetic operation was not saved. Review the selected state and try again.':'The local demo is unavailable. No real service was called.'});}
 });}}]});
 try{await server.listen();}catch(error){
  await server.close().catch(()=>{});
  try{await current.close();}finally{await current.shutdown?.();}
  throw error;
 }
 return {origin,info,close:async()=>{await server.close();await current.close();await current.shutdown?.();}};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{assertDemoEnvironment();const local=parseEnv(await readFile('.env.local','utf8'));const factory=await postgresDemoFactory(process.env.DEMO_DATABASE_URL||local.DATABASE_URL);const demo=await startAdminDemo({repositoryFactory:factory});console.log('TEST / DEMO: NO REAL ORDERS. '+demo.origin+'/__demo/admin');let closing=false;const stop=async()=>{if(closing)return;closing=true;await demo.close();process.exit(0);};process.on('SIGINT',stop);process.on('SIGTERM',stop);}catch{console.error('Local admin demo could not start. Use only the existing loopback PostgreSQL sandbox on port 55432. No production service was accessed.');process.exitCode=1;}
}
