import {mkdir,readdir,copyFile,unlink,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export async function protectSourceMaps(root,{release='local'}={}){
 if(!/^(?:local|[a-f0-9]{7,40})$/i.test(release))throw new Error('Invalid source-map release identifier.');
 const client=path.join(root,'dist','client');
 const destination=path.join(root,'.tools','private-sourcemaps',release);
 let files=0;
 async function walk(directory){for(const entry of await readdir(directory,{withFileTypes:true})){
  const source=path.join(directory,entry.name);
  if(entry.isSymbolicLink())throw new Error('Source-map protection refuses symbolic links in public build output.');
  if(entry.isDirectory())await walk(source);
  else if(entry.isFile()&&entry.name.endsWith('.map')){
   const target=path.join(destination,path.relative(client,source));await mkdir(path.dirname(target),{recursive:true});await copyFile(source,target);await unlink(source);files++;
  }
 }}
 await walk(client);
 await mkdir(destination,{recursive:true});
 const evidence={release,privateSourceMapFiles:files,publicSourceMaps:false,monitoringDeliveryVerified:false,sourceMapsResolved:false,note:'Local build preparation only. An actual controlled provider event and resolved stack must be inspected before verification.'};
 await writeFile(path.join(destination,'build-evidence.json'),JSON.stringify(evidence,null,2));
 return evidence;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
 const evidence=await protectSourceMaps(root,{release:process.env.COMMIT_REF||process.env.RELEASE_SHA||'local'});
 console.log(`Protected ${evidence.privateSourceMapFiles} source map files from public packaging. Provider verification remains pending.`);
}
