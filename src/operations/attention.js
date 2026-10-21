// Group only repeated instances of the same issue. Keep every underlying record
// available in Activity; never silently dismiss a refund or shipping deadline.
export function attentionQueue(failures){
 const delayed=new Set(failures.filter(f=>f.type==='shipment_delay').map(f=>f.orderNumber));
 const groups=new Map();
 for(const [index,f] of failures.entries()){
  if(f.type==='fulfillment'&&f.orderNumber&&delayed.has(f.orderNumber))continue;
  const key=[f.type,f.status,f.orderNumber||f.eventId||index].join(':');
  const existing=groups.get(key);
  if(existing){existing.count++;continue;}
  const priority=['refund_required','cancel_refund_due'].includes(f.status)||f.type==='refund'?0:['webhook','reservation','shipment','inventory','account','account_deletion'].includes(f.type)||f.status==='failed'||f.status==='manual-review'?1:f.status==='queued'?3:2;
  groups.set(key,{...f,key,count:1,priority});
 }
 return [...groups.values()].sort((a,b)=>a.priority-b.priority);
}
