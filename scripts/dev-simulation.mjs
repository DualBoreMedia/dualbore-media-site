import {spawn} from 'node:child_process';
const port=Number(process.env.COMMERCE_SIMULATION_PORT||4178);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid simulation port.');
const env={...process.env,COMMERCE_TEST_ENABLED:'true',COMMERCE_MOCK:'true',SITE_ORIGIN:'http://127.0.0.1:'+port,TEST_INVENTORY_PER_VARIANT:'2',TEST_DATABASE_DIRECTORY:process.env.TEST_DATABASE_DIRECTORY||'.tools/commerce-simulation-db',RESEND_API_KEY:''};
console.log('LOCAL SIMULATION ONLY: two synthetic units per size on first seed. No Stripe calls or real emails.');
const child=spawn(process.execPath,['node_modules/vite/bin/vite.js','--mode','commerce','--host','127.0.0.1','--port',String(port),'--strictPort'],{env,stdio:'inherit'});
child.on('exit',code=>process.exitCode=code??1);process.on('SIGINT',()=>child.kill('SIGINT'));
