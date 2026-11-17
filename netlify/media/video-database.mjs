import pg from 'pg';
import {validVideoSnapshot} from './video-cache.mjs';
// This uses the existing PostgreSQL provider only. The migration must be applied
// separately through the existing approval/verification process.
export function createVideoStore({databaseUrl=process.env.DATABASE_URL,Pool=pg.Pool}={}){
 if(!/^postgres(?:ql)?:\/\//.test(databaseUrl||''))return null;
 const pool=new Pool({connectionString:databaseUrl,max:1,connectionTimeoutMillis:5000});
 return {
  async read(){
   try{const result=await pool.query("SELECT payload FROM public_video_snapshots WHERE id = $1",['latest']);const data=result.rows[0]?.payload;return validVideoSnapshot(data)?data:null;}catch{return null;}
  },
  async save(data){
   if(!validVideoSnapshot(data))return false;
   const result=await pool.query("INSERT INTO public_video_snapshots (id, payload, updated_at) VALUES ($1,$2::jsonb,$3) ON CONFLICT (id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=EXCLUDED.updated_at WHERE public_video_snapshots.updated_at <= EXCLUDED.updated_at",
    ['latest',JSON.stringify(data),data.updatedAt]);
   return result.rowCount===0?'superseded':true;
  },
  async record({time,updated,reason,count}){
   await pool.query("INSERT INTO public_video_sync_runs (attempted_at,updated,reason,item_count) VALUES ($1,$2,$3,$4)",
    [time,updated,reason,count]);
  },
  async status(){
   try{
    const [runs,snapshots]=await Promise.all([
     pool.query('SELECT attempted_at, updated, reason, item_count FROM public_video_sync_runs ORDER BY attempted_at DESC LIMIT 1'),
     pool.query("SELECT updated_at, jsonb_array_length(payload->'items') AS item_count FROM public_video_snapshots WHERE id = $1",['latest'])
    ]);
    const last=runs.rows[0],good=snapshots.rows[0];
    return {lastAttemptAt:last?.attempted_at||null,updated:last?.updated===true,reason:last?.reason||'not_run',itemCount:last?.item_count||0,lastGoodAt:good?.updated_at||null,savedItemCount:good?.item_count||0};
   }catch{return null;}
  },
  async close(){await pool.end();}
 };
}
