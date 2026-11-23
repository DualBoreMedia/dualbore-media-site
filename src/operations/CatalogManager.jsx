// The catalog editors have separate local draft state. Unmounting one loses
// those unsaved keystrokes. Keep the navigation guard at this shared boundary.
import {rememberOperationsView} from './workos-session.js';
import {useCallback,useEffect,useState} from 'react';
import {Products} from './Products.jsx';
import {MxBikes} from './MxBikes.jsx';
import {clearTextRecovery} from './draft-recovery.js';
export function CatalogManager({products,auth,reload,initialType='physical',onEditingStateChange}){
 const [type,setType]=useState(initialType);
 const [editing,setEditing]=useState({dirty:false,busy:false});
 const onEditorChange=useCallback(next=>{
  // Avoid redundant parent updates during rerenders of long operations tables.
  setEditing(previous=>previous.dirty===next.dirty&&previous.busy===next.busy&&previous.editor===next.editor&&previous.recordId===next.recordId?previous:next);
  onEditingStateChange?.(next);
 },[onEditingStateChange]);
 useEffect(()=>{
  if(!editing.dirty&&!editing.busy)return;
  const warn=event=>{event.preventDefault();event.returnValue='';};
  window.addEventListener('beforeunload',warn);
  return()=>window.removeEventListener('beforeunload',warn);
 },[editing.dirty,editing.busy]);
 const changeType=next=>{
  if(next===type)return;
  // Never discard a draft on an ordinary filter click; never navigate during a write.
  if(editing.busy)return;
  if(editing.dirty&&!window.confirm('Discard unsaved catalog edits?'))return;
  // Confirmed discard removes only this editor's local text recovery.
  if(editing.dirty)clearTextRecovery({ownerId:auth.user?.id,editor:editing.editor,productId:editing.recordId});
  setEditing({dirty:false,busy:false});
  onEditingStateChange?.({dirty:false,busy:false});
  setType(next);
  rememberOperationsView(next==='mx_setup'?'MX Bikes':'Catalog');
 };
 return <section aria-label="Unified catalog"><h2>Catalog</h2><label className="ops-field">Product type filter<select aria-label="Product type filter" value={type} onChange={e=>changeType(e.target.value)}><option value="physical">Merchandise</option><option value="mx_setup">MX Bikes setups</option></select></label>{type==='mx_setup'?<MxBikes products={products} auth={auth} reload={reload} onEditingStateChange={onEditorChange}/>:<Products products={products.filter(p=>p.draft.type==='physical')} auth={auth} reload={reload} onEditingStateChange={onEditorChange}/>}</section>;
}
