// Use the same Next.js runtime as Vercel. Normalize preview-daemon Vite flags.
import { fileURLToPath } from 'node:url';
import {spawn} from 'node:child_process';
import {mkdirSync,createWriteStream} from 'node:fs';
const raw=process.argv.slice(2),args=[];
for(let i=0;i<raw.length;i++){
 if(raw[i]==='--host'){if(raw[i+1]&&!raw[i+1].startsWith('--'))i++;continue;}
 if(raw[i]==='--strictPort')continue;
 args.push(raw[i]);
}
mkdirSync('.sites-runtime',{recursive:true});const log=createWriteStream('.sites-runtime/next-preview.log');
const child=spawn(process.execPath,[fileURLToPath(new URL('../node_modules/next/dist/bin/next',import.meta.url)),'dev','--webpack','--hostname','0.0.0.0',...args],{stdio:['inherit','pipe','pipe']});
child.stdout.on('data',chunk=>{process.stdout.write(chunk);log.write(chunk);});child.stderr.on('data',chunk=>{process.stderr.write(chunk);log.write(chunk);});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>{log.end();process.exitCode=code??1;});
