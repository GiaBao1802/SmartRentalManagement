import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { recommend, filterCandidates } from './engine.mjs';
import { createOllamaProvider } from './provider.mjs';
import { createAdvisorFlow } from './flow.mjs';

const assets = new Map([
  ['/', ['index.html','text/html; charset=utf-8']],
  ['/app.js', ['app.js','text/javascript; charset=utf-8']],
  ['/style.css', ['style.css','text/css; charset=utf-8']],
]);
export function createDemoServer({ provider = createOllamaProvider(), flow = createAdvisorFlow(), inventoryFor, datasetMode=false } = {}) {
  return createServer(async (req,res) => {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'");
    const send = (status,data) => { if (res.destroyed) return; res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(data)); };
    // Loopback binding plus Host/Origin checks: browser pages cannot borrow the local model.
    const port = serverPort(res);
    const hosts = [`127.0.0.1:${port}`,`localhost:${port}`];
    if (!hosts.includes(req.headers.host) || (req.headers.origin && !hosts.some(h => req.headers.origin === `http://${h}`))) return send(403,{error:'Nguồn truy cập không hợp lệ.'});
    try {
      if (req.method === 'GET' && assets.has(req.url)) {
        const [name,type] = assets.get(req.url);
        let body = await readFile(new URL(name,import.meta.url));
        if(datasetMode && name==='index.html')body=body.toString().replace('class="note-number">18','class="note-number">300').replace('Khoản mẫu không tự tăng theo số người.','Ước tính chung: 45 kWh + 3 m³ nước/người/tháng; xe máy tính 1 xe khi có chỗ xe, xe buýt tính 0 xe. Chưa gồm gửi xe ngoài.').replace('Code lọc điều kiện bắt buộc. Qwen so sánh các phòng đạt điều kiện và chọn tối đa 3 phòng.','Bộ 300 phòng giả lập. Bốn tiện ích đang được hỗ trợ trong bộ lọc. Qwen so sánh theo nhóm khi có nhiều phòng; các giới hạn thú cưng cần xác nhận với chủ trọ.');
        res.writeHead(200,{'Content-Type':type}); res.end(body); return;
      }
      if (datasetMode && req.method === 'GET' && req.url === '/demo/status') {
        const { dataset } = await import('./dataset.mjs');
        return send(200,{ mode:'json-demo', dataset_id:dataset.dataset_id, rooms:dataset.rooms.length, properties:dataset.properties.length, database:false });
      }
      if (datasetMode && req.method === 'GET' && req.url === '/demo/rooms') {
        const { dataset } = await import('./dataset.mjs');
        return send(200,{ data:dataset.rooms, synthetic:true, as_of:dataset.as_of });
      }
      if (req.method !== 'POST' || !['/demo/recommend','/demo/explain','/demo/extract','/demo/candidates','/demo/select'].includes(req.url)) return send(404,{error:'Không tìm thấy.'});
      if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') return send(415,{error:'Cần gửi JSON.'});
      let size = 0; const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 8192) { send(413,{error:'Nội dung quá dài.'}); return; }
        chunks.push(chunk);
      }
      if (['/demo/extract','/demo/candidates','/demo/select'].includes(req.url)) {
        let input, result;
        try {
          input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error();
          if (req.url === '/demo/extract') {
            if (Object.keys(input).join() !== 'note' || typeof input.note !== 'string' || !input.note.trim() || input.note.length > 500) throw new Error();
          } else {
            if (Object.keys(input).sort().join() !== 'confirmed,preferences' || input.confirmed !== true) throw new Error();
            result = inventoryFor ? recommend(input.preferences,inventoryFor(input.preferences),Infinity) : filterCandidates(input.preferences);
          }
        } catch { return send(400,{error:'Cần nhu cầu hợp lệ hoặc tiêu chí đã được bạn xác nhận.'}); }
        if (req.url === '/demo/candidates') return send(200,{...result,cards:[]});
        const controller = new AbortController();
        const cancel = () => { if (!res.writableEnded) controller.abort(); };
        res.once('close',cancel);
        try {
          if (res.destroyed) controller.abort();
          return send(200,req.url === '/demo/extract' ? await flow.extract(input.note,{signal:controller.signal}) : await flow.select(result,{signal:controller.signal}));
        } finally { res.removeListener('close',cancel); }
      }
      let result;
      try { const preferences=JSON.parse(Buffer.concat(chunks).toString('utf8'));result = recommend(preferences,inventoryFor?.(preferences)); }
      catch { return send(400,{error:'Tiêu chí không hợp lệ. Kiểm tra ngân sách, số người và thời gian đi lại.'}); }
      // Recompute from preferences, never accept client-selected rooms/facts/prices.
      if (req.url === '/demo/recommend') return send(200,result);
      const controller = new AbortController();
      const cancel = () => { if (!res.writableEnded) controller.abort(); };
      res.once('close',cancel);
      try {
        if (res.destroyed) controller.abort();
        return send(200,await provider.explain(result,{signal:controller.signal}));
      } finally { res.removeListener('close',cancel); }
    } catch { if (!res.headersSent) send(500,{error:'Không thể xử lý yêu cầu demo.'}); else res.end(); }
  });
}
function serverPort(res) { return res.socket?.localPort; }
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.ROOM_ADVISOR_PORT || 4318);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('ROOM_ADVISOR_PORT không hợp lệ.');
  const server = createDemoServer();
  server.on('error',error => { console.error(`Không mở được demo: ${error.code}`); process.exitCode = 1; });
  server.listen(port,'127.0.0.1',() => console.log(`Góc Trọ · Demo dữ liệu giả lập: http://127.0.0.1:${port}`));
}
