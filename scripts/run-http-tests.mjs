// Supply {"url":"<isolated branch connection>"} over hidden stdin.
import { spawn } from 'node:child_process';
if(process.stdin.isTTY) process.stdin.setRawMode(true);
const input=await new Promise(resolve=>{let raw='';process.stdin.setEncoding('utf8');process.stdin.on('data',c=>{raw+=c;if(raw.includes('\n')){process.stdin.pause();if(process.stdin.isTTY)process.stdin.setRawMode(false);resolve(JSON.parse(raw));}})});
process.env.DATABASE_URL=input.url;
process.env.ROOMIE_TEST_DB_HOST=new URL(input.url).hostname;
const port=4188;
process.env.ROOMIE_TEST_BASE_URL=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env:process.env,stdio:['ignore','pipe','pipe']});
child.stdout.on('data',c=>process.stdout.write(c)); child.stderr.on('data',c=>process.stderr.write(c));
try {
 const deadline=Date.now()+45000;let ready=false;
 while(Date.now()<deadline){try{const r=await fetch(process.env.ROOMIE_TEST_BASE_URL+'/api/health',{signal:AbortSignal.timeout(1000)});if(r.ok){ready=true;break;}}catch{} await new Promise(r=>setTimeout(r,250));}
 if(!ready)throw Error('Production test server did not become healthy.');
 await import('./test-full-system.mjs');
} finally {child.kill('SIGTERM');}
