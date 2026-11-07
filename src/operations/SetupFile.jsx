import {useState} from 'react';
import {uploadSetupFile} from './client.js';

export function SetupFile({record,dirty,busy,auth,onSaved,onBusyChange}) {
 const [file,setFile]=useState(null),[uploading,setUploading]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const disabled=busy||uploading||dirty||!record||record.status==='archived';
 const upload=async()=>{
  setUploading(true);onBusyChange(true);setMessage('');setError('');
  try {const result=await uploadSetupFile(auth.getToken,{productId:record.id,expectedVersion:record.version,file},{fetcher:auth.fetcher});await onSaved(result.product);setFile(null);setMessage('Private file saved. Compatibility testing must be reviewed again. No email was sent.');}
  catch(e){setError(e.message);}finally{setUploading(false);onBusyChange(false);}
 };
 return <section className="ops-setup-file" aria-label="Private setup file" aria-busy={uploading}>
  <h4>Private setup file</h4>
  <p>Attach an original .stp file, up to 2 MB. It stays in private storage. Uploading does not publish it or enable sales or email.</p>
  {record?.setupFile?<dl><dt>Attached file</dt><dd>{record.setupFile.filename}</dd><dt>Embedded bike ID</dt><dd>{record.setupFile.embeddedBikeId}</dd><dt>SHA-256</dt><dd>{record.setupFile.sha256}</dd></dl>:<p>No file attached.</p>}
  <p className="ops-muted">The file format and checksum are checked. In-game compatibility, exact OEM pack version and MX Bikes version still need real testing. Replacing a file preserves older versions for existing orders.</p>
  <fieldset disabled={disabled}><legend>Attach or replace file</legend><label className="ops-field">Choose .stp file<input key={record?.id||'new'} type="file" accept=".stp" onChange={e=>{setFile(e.target.files?.[0]||null);setError('');setMessage('');}}/></label><button disabled={!file} onClick={upload}>{uploading?'Saving private file...':'Save private file'}</button></fieldset>
  {(!record||dirty)&&<p>Save Draft before attaching a file.</p>}
  <p role="status">{message}</p>{error&&<p role="alert" className="ops-error">{error}</p>}
 </section>;
}
