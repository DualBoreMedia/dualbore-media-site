import React from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,expect,test,vi} from 'vitest';
import {page} from 'vitest/browser';
import {PublicDetail} from '../../src/PublicDetail.jsx';
import {App} from '../../src/App.jsx';
import '../../src/styles.css';
import '../../src/public-detail.css';

let root,host;
beforeEach(()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);history.replaceState(null,'','/');vi.stubGlobal('fetch',vi.fn(async()=>Response.json({source:'curated',items:[]})));});
afterEach(()=>{root.unmount();host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();history.replaceState(null,'','/');});

test('each build has a direct journal URL with its real published episode links',async()=>{
 history.replaceState(null,'','/builds/rd400/');
 root.render(<PublicDetail/>);
 await expect.element(page.getByRole('heading',{name:'Yamaha RD400'})).toBeVisible();
 await expect.element(page.getByRole('link',{name:/Into the hills on the 1977 RD400/})).toHaveAttribute('href','/videos/c7gF1jjT9YQ/');
 expect(document.querySelector('link[rel="canonical"]').href).toBe('https://dualboremedia.com/builds/rd400/');
});

test('a curated video direct URL opens its privacy-enhanced player and YouTube source link',async()=>{
 history.replaceState(null,'','/videos/c7gF1jjT9YQ/');
 root.render(<PublicDetail/>);
 await expect.element(page.getByRole('heading',{name:'Into the hills on the 1977 RD400'})).toBeVisible();
 await expect.element(page.getByTitle('Into the hills on the 1977 RD400')).toHaveAttribute('src','https://www.youtube-nocookie.com/embed/c7gF1jjT9YQ');
 await expect.element(page.getByRole('link',{name:'Watch on YouTube'})).toHaveAttribute('href','https://www.youtube.com/watch?v=c7gF1jjT9YQ');
});

test('live archive can resolve a newly synced video URL without code changes',async()=>{
 const id='aB0_9-hT3YQ';
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({items:[{id,title:'New RD400 Session',category:'Two-Strokes',image:'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg',duration:'4:03'}]})));
 history.replaceState(null,'','/videos/'+id+'/');
 root.render(<PublicDetail/>);
 await expect.element(page.getByRole('heading',{name:'New RD400 Session'})).toBeVisible();
 await expect.element(page.getByTitle('New RD400 Session')).toHaveAttribute('src','https://www.youtube-nocookie.com/embed/'+id);
});

test('Netlify lowercase episode paths preserve the real case-sensitive YouTube ID',async()=>{
 history.replaceState(null,'','/videos/loosfhjgupm/');
 root.render(<PublicDetail/>);
 await expect.element(page.getByRole('heading',{name:'The N54 single-turbo build starts here'})).toBeVisible();
 await expect.element(page.getByTitle('The N54 single-turbo build starts here')).toHaveAttribute('src','https://www.youtube-nocookie.com/embed/LOOSFHJGUPM');
 await expect.element(page.getByRole('link',{name:'Watch on YouTube'})).toHaveAttribute('href','https://www.youtube.com/watch?v=LOOSFHJGUPM');
 expect(document.querySelector('link[rel="canonical"]').href).toBe('https://dualboremedia.com/videos/LOOSFHJGUPM/');
});

test('garage and vault expose crawlable links to actual individual pages',async()=>{
 root.render(<App/>);
 await expect.element(page.getByRole('link',{name:'Yamaha RD400 build log'})).toHaveAttribute('href','/builds/rd400/');
 await page.getByRole('tab',{name:/Video Vault/}).click();
 await expect.element(page.getByRole('link',{name:/Into the hills on the 1977 RD400 video page/})).toHaveAttribute('href','/videos/c7gF1jjT9YQ/');
});
