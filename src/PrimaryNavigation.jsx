import {views} from './content.js';
import './primary-navigation.css';
import {FaWrench,FaFilm,FaShirt,FaUsers,FaFlagCheckered} from 'react-icons/fa6';
const icons={garage:FaWrench,vault:FaFilm,merch:FaShirt,setups:FaFlagCheckered,crew:FaUsers};
export function PrimaryNavigation({active,onChoose,refs,hidden=false}){
 const keyboard=(event,index)=>{
  const next={ArrowRight:(index+1)%views.length,ArrowLeft:(index+views.length-1)%views.length,Home:0,End:views.length-1}[event.key];
  if(next===undefined)return;
  event.preventDefault();const target=views[next],element=event.currentTarget.parentElement.children[next];
  if(onChoose&&!target.href)onChoose(target.id);
  element?.focus();
 };
 return <nav className="workspace-nav" hidden={hidden} aria-label="Primary navigation"><div className="tabs" role="tablist" aria-label="Explore DualBore Media">{views.map((item,index)=>{
  const Icon=icons[item.id],selected=active===item.id,props={id:`tab-${item.id}`,role:'tab','aria-label':`${item.number} ${item.label}`,'aria-selected':selected,tabIndex:selected?0:-1,onKeyDown:event=>keyboard(event,index)};
  const content=<><Icon aria-hidden="true"/><span>{item.label}</span><span className="mobile-tab-label">{item.short}</span><small aria-hidden="true">{item.number}</small></>;
  return item.href||!onChoose?<a {...props} key={item.id} href={item.href||`/#${item.id}`} aria-controls={selected?'panel-'+item.id:undefined}>{content}</a>:<button {...props} key={item.id} ref={el=>{if(refs)refs.current[item.id]=el;}} aria-controls={`panel-${item.id}`} onClick={()=>onChoose(item.id)}>{content}</button>;
 })}</div></nav>;
}
