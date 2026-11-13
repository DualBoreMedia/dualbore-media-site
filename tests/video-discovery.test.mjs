import test from 'node:test';import assert from 'node:assert/strict';
import {durationSeconds,videoFormat,videoBuild,discoverVideos,newestEpisode} from '../src/video-discovery.js';
import {videoSitemap} from '../netlify/functions/video-sitemap.mjs';
const video=(id,title,duration,publishedAt)=>({id,title,duration,publishedAt});
test('editorial format uses duration, preserves unknowns, and always chooses a long homepage feature',()=>{
 for(const [duration,seconds,format]of [['0:07',7,'shorts'],['2:59',179,'shorts'],['3:00',180,'episodes'],['1:02:03',3723,'episodes'],['unknown',null,'episodes']]){const v={duration};assert.equal(durationSeconds(v),seconds);assert.equal(videoFormat(v),format);}
 assert.equal(videoFormat({duration:'unknown',title:'#Shorts ride'}),'shorts');
 const videos=[video('short','SV1000 clip','0:07','2026-11-12'),video('long','SV1000 ride','20:00','2026-11-11')];assert.equal(newestEpisode(videos).id,'long');assert.equal(newestEpisode([videos[0]]),null);
});
test('build identity never guesses from turbo, manufacturer, generic bike, or MX Bikes livestream titles',()=>{
 for(const [title,build]of [['N54 single turbo','n54'],['SV1000S night ride','sv1000'],['RD 400 ride','rd400'],['CRF110 laps','crf110'],['Turbo riding','other'],['Suzuki repair','other'],['MX Bikes livestream on CRF110','other']])assert.equal(videoBuild({title}),build,title);
 assert.equal(videoBuild({id:'LOOSFHJGUPM',title:'Original curated build'}),'n54');
});
test('format and bike search, combined filters and stable newest/oldest/longest sorting use existing metadata',()=>{
 const rows=[video('a','SV1000 night','10:00','2026-11-10'),video('b','SV1000 clip','0:07','2026-11-12'),video('c','N54 build','30:00','2026-11-11')];
 assert.deepEqual(discoverVideos(rows).map(v=>v.id),['c','a']);assert.deepEqual(discoverVideos(rows,{sort:'oldest'}).map(v=>v.id),['a','c']);assert.deepEqual(discoverVideos(rows,{sort:'longest'}).map(v=>v.id),['c','a']);
 assert.deepEqual(discoverVideos(rows,{format:'shorts',query:'Shorts SV1000'}).map(v=>v.id),['b']);assert.deepEqual(discoverVideos(rows,{build:'n54'}).map(v=>v.id),['c']);assert.equal(discoverVideos(rows,{query:'absent'}).length,0);
});
test('synced sitemap deduplicates IDs and cannot inject XML or private file paths',()=>{
 const xml=videoSitemap([{id:'8qqh7JPvcyE'},{id:'8qqh7JPvcyE'},{id:'<script>'},{id:'../../private.stp'}]);assert.equal((xml.match(/<url>/g)||[]).length,1);assert.ok(xml.includes('/videos/8qqh7JPvcyE/'));assert.ok(!xml.includes('private.stp'));assert.ok(!xml.includes('<script>'));
});
