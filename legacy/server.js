const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const START_PORT = parseInt(process.env.PORT, 10) || 8080;
const ROOT = __dirname;
const DB_FILE = path.join(ROOT, 'demo-database.json');

function readDb() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch (_) {
    const initial = {
      profile: { username: 'nguyenvana', name: 'Nguyễn Văn An', email: 'an.nguyen@gmail.com', phone: '0901 234 567', address: '12 Nguyễn Trãi, Xuân Lộc' },
      plan: 'Cơ bản', passwordHash: crypto.createHash('sha256').update('123456').digest('hex'), notifications: { invoice: true, overdue: true, contract: false, issue: true },
      services: [
        { id: 1, name: 'Hồ bơi', area: 'Khu A', price: 50000, unit: 'lượt', open: '06:00', close: '21:00', active: true },
        { id: 2, name: 'Phòng gym', area: 'Khu A', price: 30000, unit: 'lượt', open: '05:00', close: '22:00', active: true },
        { id: 3, name: 'Sân tennis', area: 'Khu B', price: 120000, unit: 'giờ', open: '06:00', close: '20:00', active: false },
        { id: 4, name: 'Phòng BBQ', area: 'Khu B', price: 200000, unit: 'giờ', open: '10:00', close: '22:00', active: true }
      ]
    };
    writeDb(initial);
    return initial;
  }
}
function writeDb(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8'); }

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function createServer() {
  return http.createServer((req, res) => {
    if (req.url.startsWith('/api/demo/')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
      const db = readDb();
      if (req.method === 'GET') { res.writeHead(200); return res.end(JSON.stringify(db)); }
      if (req.method === 'PUT' || req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const payload = JSON.parse(body || '{}');
            if (req.url.startsWith('/api/demo/profile')) db.profile = { ...db.profile, ...payload };
            else if (req.url.startsWith('/api/demo/notifications')) db.notifications = { ...db.notifications, ...payload };
            else if (req.url.startsWith('/api/demo/services')) db.services = payload;
            else if (req.url.startsWith('/api/demo/plan')) db.plan = payload.plan;
            else if (req.url.startsWith('/api/demo/password')) {
              const current = crypto.createHash('sha256').update(payload.currentPassword || '').digest('hex');
              if (current !== db.passwordHash) { res.writeHead(400); return res.end(JSON.stringify({ error: 'Mật khẩu hiện tại chưa đúng' })); }
              if (!payload.newPassword || payload.newPassword.length < 6) { res.writeHead(400); return res.end(JSON.stringify({ error: 'Mật khẩu mới cần ít nhất 6 ký tự' })); }
              db.passwordHash = crypto.createHash('sha256').update(payload.newPassword).digest('hex');
            }
            writeDb(db); res.writeHead(200); res.end(JSON.stringify(db));
          } catch (_) { res.writeHead(400); res.end(JSON.stringify({ error: 'Dữ liệu không hợp lệ' })); }
        });
        return;
      }
      res.writeHead(404); return res.end(JSON.stringify({ error: 'Không tìm thấy API' }));
    }
    let reqPath = decodeURI(req.url.split('?')[0]);
    if (reqPath === '/' || reqPath === '') {
      reqPath = '/index.html';
    }

    const filePath = path.join(ROOT, reqPath);

    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('403 Forbidden');
      return;
    }

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        const fallbackPath = path.join(ROOT, 'index.html');
        fs.readFile(fallbackPath, (errFallback, content) => {
          if (errFallback) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('404 Not Found');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(content);
          }
        });
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      fs.readFile(filePath, (readErr, content) => {
        if (readErr) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('500 Internal Server Error');
        } else {
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(content);
        }
      });
    });
  });
}

function startListening(port) {
  const server = createServer();
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} đang bận, thử port ${port + 1}...`);
      startListening(port + 1);
    } else {
      console.error('Lỗi khởi động server:', err);
    }
  });

  server.once('listening', () => {
    console.log(`Server "Góc trọ" đang hoạt động tại: http://localhost:${port}`);
    // Save current active url to a small file for easy reading
    fs.writeFileSync(path.join(ROOT, '.port'), String(port), 'utf8');
  });

  server.listen(port);
}

startListening(START_PORT);
