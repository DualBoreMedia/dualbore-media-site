import test from'node:test';import assert from'node:assert/strict';import{EventEmitter}from'node:events';import{protectPool}from'../netlify/commerce/repository.mjs';
test('idle database disconnect is handled once without logging error or client details',()=>{
 const pool=new EventEmitter(),logs=[];protectPool(pool,code=>logs.push(code));protectPool(pool,code=>logs.push(code));
 assert.doesNotThrow(()=>pool.emit('error',Object.assign(new Error('private connection string and customer address'),{client:{password:'private'}})));
 assert.deepEqual(logs,['idle_connection_lost']);assert.equal(pool.listenerCount('error'),1);
});
