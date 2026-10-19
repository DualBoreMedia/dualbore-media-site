import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import {sentryVitePlugin} from '@sentry/vite-plugin';
import { handleQuoteRequest } from './netlify/lib/cart-quote.mjs';

function localCommerce(mode) {
  return { name:'local-commerce-quote', configureServer(server) {
    if (mode !== 'commerce') return;
    const env={...loadEnv(mode,process.cwd(),''),...process.env};
    server.middlewares.use('/api/auth',async(req,res)=>{
      try{
        const host=req.headers.host;if(!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host||'')){res.writeHead(403);res.end();return;}
        let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>8192){res.writeHead(413);res.end();return;}chunks.push(chunk);}
        const request=new Request(`http://${host}${req.originalUrl}`,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})});
        const {workosHttp}=await import('./netlify/operations/workos-http.mjs');const response=await workosHttp(request,{env,clientIp:req.socket.remoteAddress||'local'});
        const output=Object.fromEntries(response.headers);if(response.headers.getSetCookie().length)output['set-cookie']=response.headers.getSetCookie();res.writeHead(response.status,output);res.end(await response.text());
      }catch{res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'Secure sign-in is temporarily unavailable.'}));}
    });
    server.middlewares.use('/api/operations',async(req,res)=>{
      try{
        const host=req.headers.host;if(!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host||'')){res.writeHead(403);res.end();return;}
        let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>16384){res.writeHead(413);res.end();return;}chunks.push(chunk);}
        const request=new Request(`http://${host}${req.originalUrl}`,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})});
        const {operationsHttp}=await import('./netlify/operations/http.mjs');const response=await operationsHttp(request,{env,clientIp:req.socket.remoteAddress||'local'});
        res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());
      }catch{res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'The garage is temporarily unavailable.'}));}
    });
    server.middlewares.use('/api/commerce',async(req,res)=>{
      try{
        const host=req.headers.host;
        if(!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host||'')){res.writeHead(403);res.end();return;}
        let length=0;const chunks=[];
        for await(const chunk of req){length+=chunk.length;if(length>262144){res.writeHead(413);res.end();return;}chunks.push(chunk);}
        const path=req.originalUrl||'/api/commerce'+req.url;
        const request=new Request(`http://${host}${path}`,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})});
        const {commerceHttp}=await import('./netlify/commerce/http.mjs');
        const response=await commerceHttp(request,{env});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());
      }catch{res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'Test commerce is unavailable.'}));}
    });
    server.middlewares.use('/api/cart-quote', async (req,res) => {
      try {
        const host=req.headers.host;
        if (!host || !/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host)) { res.statusCode=403; res.end(); return; }
        let size=0; const chunks=[];
        for await (const chunk of req) {
          size+=chunk.length;
          if (size>4096) { res.writeHead(413,{'Content-Type':'application/json','Cache-Control':'no-store'}); res.end(JSON.stringify({error:'Cart is too large.'})); return; }
          chunks.push(chunk);
        }
        const body=Buffer.concat(chunks);
        const request=new Request(`http://${host}/api/cart-quote`,{method:req.method,headers:req.headers,
          ...(['GET','HEAD'].includes(req.method)?{}:{body})});
        const response=await handleQuoteRequest(request,{enabled:true});
        res.writeHead(response.status,Object.fromEntries(response.headers)); res.end(await response.text());
      } catch { res.writeHead(400,{'Cache-Control':'no-store'}); res.end(); }
    });
  }};
}

export default defineConfig(({mode}) => {
 const release=/^[a-f0-9]{7,40}$/i.test(process.env.COMMIT_REF||process.env.RELEASE_SHA||'')?(process.env.COMMIT_REF||process.env.RELEASE_SHA):'local';
 const environment=mode==='production'?'production':mode;
 const upload=process.env.SENTRY_UPLOAD_SOURCEMAPS==='true';
 if(upload&&(!process.env.SENTRY_AUTH_TOKEN||!process.env.SENTRY_ORG||!process.env.SENTRY_PROJECT||release==='local'))throw new Error('Private source-map upload requires an explicit target, credentials and release SHA.');
 return ({
  define:{__APP_RELEASE__:JSON.stringify(release),__APP_ENVIRONMENT__:JSON.stringify(environment)},
  build: {
    outDir: "dist/client",
    sourcemap:'hidden',
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "127.0.0.1",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react(),localCommerce(mode),sentryVitePlugin({telemetry:false,authToken:process.env.SENTRY_AUTH_TOKEN,org:process.env.SENTRY_ORG,project:process.env.SENTRY_PROJECT,release:{name:release,create:upload,finalize:upload},sourcemaps:{disable:!upload,assets:'./dist/client/**/*.map'}})],
 });
});
