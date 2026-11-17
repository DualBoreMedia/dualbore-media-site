import test from 'node:test';import assert from 'node:assert/strict';import {updateOrderPage} from '../src/operations/client.js';
test('changed orders leave incompatible filtered rows without resetting search, paging or unrelated records',()=>{
 const original={orderNumber:'A',version:4,status:'paid',fulfillmentStatus:'packing'},other={...original,orderNumber:'B'},data={orders:[original,other],pagination:{page:2,total:51,pageSize:25}};
 const stale=updateOrderPage(data,{...original,version:3,fulfillmentStatus:'shipped'},{fulfillmentStatus:'packing'});assert.deepEqual(stale.orders,data.orders);
 const changed=updateOrderPage(data,{...original,version:5,fulfillmentStatus:'shipped'},{fulfillmentStatus:'packing'});assert.deepEqual(changed.orders,[other]);assert.equal(changed.pagination.page,2);assert.equal(changed.pagination.total,50);assert.equal(data.orders.length,2);
 const payment=updateOrderPage(data,{...original,version:5,status:'refunded'},{status:'paid'});assert.deepEqual(payment.orders,[other]);
 const shipment=updateOrderPage({...data,orders:[{...original,shipments:[{status:'packed'}]}]},{...original,version:5,shipments:[{status:'shipped'}]},{shipmentStatus:'packed'});assert.equal(shipment.orders.length,0);
});
