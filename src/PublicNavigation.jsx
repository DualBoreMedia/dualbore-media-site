import './channel-public.css';
import {useState,useRef} from 'react';
export const publicDestinations=[['garage','Garage','/garage'],['vault','Videos','/videos'],['merch','Merch','/shop'],['setups','Setups','/setups'],['crew','Pit Crew','/pit-crew']];
const ordinaryClick=event=>event.button===0&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey;
export function PublicNavigation({active,hidden=false,onChoose,children}){
 const [open,setOpen]=useState(false);const menu=useRef(null);
 return <header className="channel-header" hidden={hidden} onKeyDown={e=>{if(e.key==='Escape'&&open){setOpen(false);menu.current?.focus();}}}><a className="channel-brand" href="/" aria-label="DualBore Media home" onClick={e=>{if(!ordinaryClick(e))return;if(onChoose){e.preventDefault();onChoose('home',true);}}}><img src="/assets/channel-logo.jpg" width="42" height="42" alt="DualBore Media Logo"/><strong>DUALBORE MEDIA</strong></a>{children}<button ref={menu} className="channel-menu" aria-label={open?'Close navigation':'Open navigation'} aria-expanded={open} aria-controls="channel-navigation" onClick={()=>setOpen(!open)}>Menu</button><nav id="channel-navigation" aria-label="Primary navigation" data-open={open}>{publicDestinations.map(([id,label,href])=><a key={id} href={href} aria-current={active===id?'page':undefined} onClick={e=>{if(!ordinaryClick(e))return;setOpen(false);if(onChoose&&id!=='setups'){e.preventDefault();onChoose(id,true);}}}>{label}</a>)}</nav></header>;
}
