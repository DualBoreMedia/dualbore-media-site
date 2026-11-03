import Stripe from 'stripe';
import pg from 'pg';
import {pathToFileURL} from 'node:url';
import {createPostgresRepository} from '../netlify/commerce/repository.mjs';
import {seedTestCatalog} from '../netlify/commerce/catalog.mjs';
import {testKey} from '../netlify/commerce/runtime.mjs';
export async function syncTestCatalog({repository,stripe}){
 const variants=await repository.transaction(s=>Object.values(s.variants));
 const products=await stripe.products.list({active:true,limit:100});
 if(products.has_more)throw new Error('Catalog pagination review required. Refusing duplicate-prone sync.');
 const mapped={};
 for(const v of variants){
  const matchingProducts=products.data.filter(p=>p.metadata?.dbm_product_id===v.productId&&p.metadata?.dbm_environment==='test');
  if(matchingProducts.length>1)throw new Error('Ambiguous product mapping. Review duplicate test products before syncing.');
  let product=mapped[v.productId]||matchingProducts[0];
  if(product?.livemode)throw new Error('Live product refused.');
  if(!product)product=await stripe.products.create({name:'[TEST] '+v.name,metadata:{dbm_product_id:v.productId,dbm_environment:'test'}},{idempotencyKey:'dbm-test-product-'+v.productId});
  mapped[v.productId]=product;
  const prices=await stripe.prices.list({product:product.id,active:true,limit:100});
  if(prices.has_more)throw new Error('Price pagination review required.');
  const matchingPrices=prices.data.filter(p=>!p.livemode&&p.currency==='usd'&&p.unit_amount===v.priceCents&&p.metadata?.dbm_variant_id===v.id);
  if(matchingPrices.length>1)throw new Error('Ambiguous price mapping. Review duplicate test prices before syncing.');
  let price=matchingPrices[0];
  if(!price)price=await stripe.prices.create({product:product.id,unit_amount:v.priceCents,currency:'usd',tax_behavior:'exclusive',metadata:{dbm_variant_id:v.id,dbm_environment:'test'}},{idempotencyKey:`dbm-test-price-${v.id}-${v.priceCents}`});
  if(price.livemode)throw new Error('Live price refused.');
  await repository.transaction(s=>{const current=s.variants[v.id];if(current.priceCents!==v.priceCents)throw new Error('Catalog changed during sync.');current.stripePriceId=price.id;current.stripeProductId=product.id;});
 }
 return{variants:variants.length,products:Object.keys(mapped).length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 let pool;
 try{
  if(process.env.COMMERCE_TEST_ENABLED!=='true'||!testKey(process.env.STRIPE_SECRET_KEY)||!process.env.DATABASE_URL)throw new Error('Enable local test mode with a test/restricted-test key and database.');
  pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:2});const repository=createPostgresRepository(pool);await seedTestCatalog(repository,{quantity:Number(process.env.TEST_INVENTORY_PER_VARIANT||0)});
  const result=await syncTestCatalog({repository,stripe:new Stripe(process.env.STRIPE_SECRET_KEY,{maxNetworkRetries:2})});console.log(`Synced ${result.variants} TEST variants across ${result.products} products. No secret files written.`);
 }catch{console.error('Test catalog sync failed. Check local database, sandbox credentials and permissions. No live mode is supported.');process.exitCode=1;}finally{await pool?.end();}
}
