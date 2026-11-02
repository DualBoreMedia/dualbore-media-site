import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {projects,films} from '../src/content.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const origin='https://dualboremedia.com/';
const escapeHtml=value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
export const detailPages=[
 ...projects.map(project=>({path:'builds/'+project.id+'/',title:project.name+' | DualBore Media Builds',description:project.description,image:project.image})),
 ...films.map(film=>({path:'videos/'+film.id+'/',title:film.title+' | DualBore Media',description:'Watch '+film.title+' on DualBore Media.',image:film.image}))
];

export function renderDetailHtml(html,page){
 const url=origin+page.path,title=escapeHtml(page.title),description=escapeHtml(page.description),image=escapeHtml(origin+page.image.replace(/^\//,''));
 let output=html.replace(/<title>[^<]*<\/title>/,'<title>'+title+'</title>');
 const tags=[
  ['meta name="description"',description],['meta property="og:title"',title],
  ['meta property="og:description"',description],['meta property="og:url"',escapeHtml(url)],
  ['meta property="og:image"',image],['meta name="twitter:title"',title],
  ['meta name="twitter:description"',description],['meta name="twitter:image"',image]
 ];
 for(const [tag,value] of tags){const start=output.indexOf('<'+tag+' content="');if(start===-1)throw Error('Missing metadata tag '+tag);const from=start+('<'+tag+' content="').length;const end=output.indexOf('"',from);if(end===-1)throw Error('Invalid metadata tag '+tag);output=output.slice(0,from)+value+output.slice(end);}
 output=output.replace(/<link rel="canonical" href="[^"]*"\s*\/>/,'<link rel="canonical" href="'+escapeHtml(url)+'" />');
 const schema=JSON.stringify({'@context':'https://schema.org','@type':'WebPage',url,name:page.title,description:page.description}).replaceAll('<','\\u003c');
 return output.replace('</head>','<script type="application/ld+json">'+schema+'</script>\n  </head>');
}
export async function prerenderDetails({directory=resolve(root,'dist/client')}={}){
 const original=await readFile(resolve(directory,'index.html'),'utf8');
 for(const page of detailPages){const target=resolve(directory,page.path,'index.html');await mkdir(dirname(target),{recursive:true});await writeFile(target,renderDetailHtml(original,page),'utf8');}
 const sitemap='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+[origin,...detailPages.map(page=>origin+page.path)].map(url=>'  <url><loc>'+escapeHtml(url)+'</loc></url>').join('\n')+'\n</urlset>\n';
 await writeFile(resolve(directory,'sitemap.xml'),sitemap,'utf8');
 return detailPages.length;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log('Generated '+await prerenderDetails()+' public build/video pages.');
