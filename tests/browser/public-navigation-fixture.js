import {expect} from 'vitest';
import {page} from 'vitest/browser';
export async function openPublicNavigation(){
 await expect.element(page.getByRole('link',{name:'DualBore Media home',exact:true})).toBeVisible();
 const menu=document.querySelector('.channel-menu');
 if(menu&&getComputedStyle(menu).display!=='none'&&menu.getAttribute('aria-expanded')!=='true')await page.getByRole('button',{name:'Open navigation',exact:true}).click();
}
export async function goPublic(label){await openPublicNavigation();await page.getByRole('navigation',{name:'Primary navigation'}).getByRole('link',{name:label,exact:true}).click();}
