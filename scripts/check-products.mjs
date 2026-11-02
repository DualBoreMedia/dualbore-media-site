import {readFile,stat} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {merch} from '../src/content.js';
import {validateProductListings} from '../src/commerce/product-requirements.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
if(args.some(x=>!x.startsWith('--file=')&&!['--phase=preview','--phase=publish'].includes(x)))throw Error('Accepted options: --file=path/to/product.json --phase=preview|publish');
const file=args.find(x=>x.startsWith('--file='))?.slice(7);
const phase=args.includes('--phase=publish')?'publish':'preview';
const source=file?JSON.parse(await readFile(resolve(process.cwd(),file),'utf8')):merch;
const products=Array.isArray(source)?source:[source];
validateProductListings(products,{phase});
for(const p of products){
 const stem=p.image.slice(1,-4);
 for(const asset of [p.image.slice(1),stem+'-480.jpg',stem+'-768.jpg']){
  const filePath=resolve(root,'public',asset);
  if(!filePath.startsWith(resolve(root,'public','assets')+sep))throw Error('Invalid artwork path.');
  if(!(await stat(filePath)).isFile())throw Error(p.id+': missing image '+asset);
 }
}
console.log('Validated '+products.length+' '+phase+' merchandise listings. No publishing or payment changes.');
