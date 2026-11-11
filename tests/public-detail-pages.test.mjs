import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {detailPages,sectionPages,publicPages,prerenderDetails,renderDetailHtml} from '../scripts/prerender-public-details.mjs';

test('static public-detail records have exact nonduplicated canonical paths for each curated build and film',()=>{
 assert.equal(detailPages.length,9);
 assert.equal(new Set(detailPages.map(p=>p.path)).size,9);
 assert.ok(detailPages.some(p=>p.path==='builds/rd400/'));
 assert.ok(detailPages.some(p=>p.path==='videos/c7gF1jjT9YQ/'));
});
test('prerendered detail metadata is path-specific and escapes HTML in social markup',()=>{
 const html='<html><head><title>Original</title><meta name="description" content="old" /><meta property="og:title" content="old" /><meta property="og:description" content="old" /><meta property="og:url" content="old" /><meta property="og:image" content="old" /><meta name="twitter:title" content="old" /><meta name="twitter:description" content="old" /><meta name="twitter:image" content="old" /><link rel="canonical" href="https://dualboremedia.com/" /></head><body></body></html>';
 const page={path:'builds/rd400/',title:'RD400 & Friends',description:'Two-stroke <ride>',image:'/assets/rd400.jpg'};
 const output=renderDetailHtml(html,page);
 assert.match(output,/<title>RD400 &amp; Friends<\/title>/);
 assert.match(output,/rel="canonical" href="https:\/\/dualboremedia.com\/builds\/rd400\/"/);
 assert.match(output,/og:image" content="https:\/\/dualboremedia.com\/assets\/rd400.jpg"/);
 assert.ok(!output.includes('content="Two-stroke <ride>"'));
 assert.match(output,/"@type":"WebPage"/);
});


test('shop and MX Bikes pages are uniquely indexed with their own previews',async()=>{
 assert.deepEqual(sectionPages.map(page=>page.path).sort(),['setups/','shop/']);
 assert.equal(publicPages.length,11);
 assert.equal(new Set(publicPages.map(page=>page.path)).size,11);
 const template='<html><head><title>Original</title><meta name="description" content="old" /><meta property="og:title" content="old" /><meta property="og:description" content="old" /><meta property="og:url" content="old" /><meta property="og:image" content="old" /><meta name="twitter:title" content="old" /><meta name="twitter:description" content="old" /><meta name="twitter:image" content="old" /><meta name="twitter:image:alt" content="RD400 ride" /><link rel="canonical" href="https://dualboremedia.com/" /></head><body></body></html>';
 const dir=await mkdtemp(join(tmpdir(),'dbm-page-metadata-'));
 try{
  await writeFile(join(dir,'index.html'),template);
  assert.equal(await prerenderDetails({directory:dir}),11);
  const sitemap=await readFile(join(dir,'sitemap.xml'),'utf8');
  for(const page of sectionPages){
   const html=await readFile(join(dir,page.path,'index.html'),'utf8');
   const url='https://dualboremedia.com/'+page.path;
   assert.ok(html.includes('<link rel="canonical" href="'+url+'" />'));
   assert.ok(html.includes('<meta property="og:url" content="'+url+'"'));
   assert.ok(html.includes('<meta property="og:image" content="https://dualboremedia.com'+page.image+'"'));
   assert.ok(html.includes('<meta name="twitter:image:alt" content="'+page.title+' preview image"'));
   assert.ok(sitemap.includes('<loc>'+url+'</loc>'));
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});
