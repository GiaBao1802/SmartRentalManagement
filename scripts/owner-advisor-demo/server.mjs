import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {answer,interpret,tasks} from './engine.mjs';
import {scopeDataset} from './dataset.mjs';
import {requireOwner,AccessError} from './auth.mjs';
export function createOwnerServer({interpretImpl=interpret,authorize=requireOwner}={}){
 return createServer(async(req,res)=>{
  const send=(code,data)=>{if(!res.destroyed){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));}};
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
  const hosts=[`127.0.0.1:${res.socket.localPort}`,`localhost:${res.socket.localPort}`];
  if(!hosts.includes(req.headers.host)||(req.headers.origin&&!hosts.some(h=>'http://'+h===req.headers.origin)))return send(403,{error:'Nguồn truy cập không hợp lệ.'});
  try{
   if(req.method==='GET'&&req.url==='/health')return send(200,{mode:'owner-advisor-demo',authRequired:true});
   const identity=await authorize(req);
   const {session,rooms,invoices}=scopeDataset(identity);
   if(req.method==='GET'&&['/','/app.js','/style.css'].includes(req.url)){
    const file=req.url==='/'?'index.html':req.url.slice(1);const body=await readFile(new URL(file,import.meta.url));res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8'});res.end(body);return;
   }
   if(req.method==='GET'&&req.url==='/demo/status')return send(200,{mode:'owner-advisor-demo',synthetic:true,database:false,asOf:session.asOf,tasks,periods:[...new Set(invoices.map(r=>r.period))].sort().reverse(),rooms:rooms.map(r=>r.code),roomCount:rooms.length});
   if(req.method!=='POST'||!['/demo/interpret','/demo/answer'].includes(req.url))return send(404,{error:'Không có thao tác này.'});
   if(req.headers['content-type']?.split(';')[0]!=='application/json')return send(415,{error:'Cần JSON.'});
   let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>4096)return send(413,{error:'Nội dung quá dài.'});chunks.push(chunk);}
   const body=JSON.parse(Buffer.concat(chunks).toString());
   if(!body||Array.isArray(body)||typeof body!=='object')return send(400,{error:'Dữ liệu không hợp lệ.'});
   if(req.url==='/demo/answer'){
    if(Object.keys(body).sort().join()!=='confirmed,period,room,task'||body.confirmed!==true)return send(400,{error:'Cần xác nhận phạm vi trước.'});
    const {confirmed,...query}=body;return send(200,answer(query,session,invoices));
   }
   if(Object.keys(body).join()!=='question')return send(400,{error:'Chỉ nhận câu hỏi.'});
   const controller=new AbortController();const cancel=()=>{if(!res.writableEnded)controller.abort();};res.once('close',cancel);
   try{return send(200,await interpretImpl(body.question,{signal:controller.signal}));}finally{res.removeListener('close',cancel);}
  }catch(error){send(error instanceof AccessError?error.status:400,{error:error instanceof SyntaxError?'JSON không hợp lệ.':error.message||'Không xử lý được yêu cầu.'});}
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const port=Number(process.env.OWNER_ADVISOR_PORT||4332);if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid port');
 createOwnerServer().listen(port,'127.0.0.1',()=>console.log(`Trợ lý chủ trọ · cần đăng nhập Admin · dữ liệu giả lập: http://localhost:${port}`));
}
