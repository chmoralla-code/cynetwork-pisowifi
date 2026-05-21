const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');

// Load environment variables from .env.local if present, else .env
function loadEnv() {
  const envLocalPath = path.join(__dirname, '.env.local');
  const envPath = path.join(__dirname, '.env');
  const targetPath = fs.existsSync(envLocalPath) ? envLocalPath : (fs.existsSync(envPath) ? envPath : null);
  
  if (targetPath) {
    console.log(`Loading environment variables from: ${path.basename(targetPath)}`);
    const content = fs.readFileSync(targetPath, 'utf8');
    content.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const index = trimmed.indexOf('=');
      if (index === -1) return;
      const key = trimmed.slice(0, index).trim();
      let val = trimmed.slice(index + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    });
  }
}
loadEnv();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());

// Emulate Vercel Serverless Function Routes locally in Express
app.all('/api/*', async (req, res, next) => {
  const pathParts = req.path.split('/').filter(Boolean); // e.g. ["api", "admin", "stats"]
  if (pathParts[0] === 'api') {
    pathParts.shift(); // Remove "api"
  }

  // Rewrite map
  const rewrites = {
    'submit-order': 'orders',
    'track-order': 'orders'
  };

  if (pathParts.length > 0 && rewrites[pathParts[0]]) {
    pathParts[0] = rewrites[pathParts[0]];
  }

  let matchedFile = null;
  let remainingParts = [];
  
  for (let i = pathParts.length; i > 0; i--) {
    const subPath = pathParts.slice(0, i).join('/');
    const fullPath = path.join(__dirname, 'api', `${subPath}.js`);
    if (fs.existsSync(fullPath)) {
      matchedFile = fullPath;
      remainingParts = pathParts.slice(i);
      break;
    }
  }

  if (matchedFile) {
    try {
      if (matchedFile.endsWith('messages.js') && remainingParts.length > 0) {
        req.query.sessionId = remainingParts[0];
      }
      if (matchedFile.endsWith('orders.js') && remainingParts.length > 0) {
        req.query.id = remainingParts[0];
      }
      
      const handler = require(matchedFile);
      if (typeof handler === 'function') {
        return await handler(req, res);
      }
    } catch (err) {
      console.error(`Error executing API handler ${matchedFile}:`, err);
      return res.status(500).json({ error: err.message });
    }
  }

  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });

let orders = [];
let chats = {}; // orderId -> [ { from, text, ts } ]

function genId(){
  return 'CNW-' + Math.random().toString(36).substr(2,6).toUpperCase();
}

app.get('/api/orders', (req, res) => {
  res.json(orders);
});

app.get('/api/orders/:id', (req, res) => {
  const id = req.params.id;
  const order = orders.find(o => o.orderId === id);
  if(!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

app.post('/api/orders', (req, res) => {
  // Support both JSON and multipart/form-data (with proof file)
  const ctype = (req.headers['content-type'] || '').toLowerCase();
  console.log('POST /api/orders content-type:', ctype);
  if (ctype.includes('multipart/form-data')) {
    upload.single('proof')(req, res, function(err) {
      if (err) return res.status(500).json({ error: 'Upload failed' });
      // debug: show parsed fields and file
      console.log('UPLOAD REQ.BODY ->', req.body);
      console.log('UPLOAD REQ.FILE ->', req.file && { originalname: req.file.originalname, filename: req.file.filename, path: req.file.path, mimetype: req.file.mimetype });
      const { fullName, packageId, price, contactNumber } = req.body;
      const order = {
        orderId: genId(),
        fullName: fullName || 'Guest',
        package: packageId || 'Starter',
        price: Number(price) || 0,
        contactNumber: contactNumber || '',
        fullAddress: req.body.fullAddress || '', // Added for client-side form
        contactEmail: req.body.contactEmail || '', // Added for client-side form
        wifiName: req.body.wifiName || '',
        rates: {
          '1php': req.body.rate1 || '',
          '5php': req.body.rate5 || '',
          '10php': req.body.rate10 || '',
          '20php': req.body.rate20 || ''
        },
        proof: req.file ? '/uploads/' + req.file.filename : undefined,
        refNumber: req.body.refNumber || '', // Added refNumber
        status: 'pending',
        createdAt: new Date().toISOString()
      };
      orders.unshift(order);
      chats[order.orderId] = [];
      io.emit('new-order', order);
      res.json(order);
    });
  } else {
    const { fullName, packageId, price, contactNumber, fullAddress, contactEmail, wifiName, rate1, rate5, rate10, rate20, refNumber } = req.body;
    const order = {
      orderId: genId(),
      fullName: fullName || 'Guest',
      package: packageId || 'Starter',
      price: Number(price) || 0,
      contactNumber: contactNumber || '',
      fullAddress: fullAddress || '', // Added for client-side form
      contactEmail: contactEmail || '', // Added for client-side form
      wifiName: wifiName || '',
      rates: {
        '1php': rate1 || '',
        '5php': rate5 || '',
        '10php': rate10 || '',
        '20php': rate20 || ''
      },
      refNumber: refNumber || '', // Added refNumber
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    orders.unshift(order);
    chats[order.orderId] = [];
    io.emit('new-order', order);
    res.json(order);
  }
});

app.put('/api/orders/:id', (req, res) => {
  const id = req.params.id;
  const order = orders.find(o => o.orderId === id);
  if(!order) return res.status(404).json({ error: 'Order not found' });
  Object.assign(order, req.body);
  io.to(id).emit('status-updated', order);
  io.emit('order-updated', order);
  res.json(order);
});

app.delete('/api/orders/:id', (req, res) => {
  const id = req.params.id;
  const idx = orders.findIndex(o => o.orderId === id);
  if(idx === -1) return res.status(404).json({ error: 'Order not found' });
  orders.splice(idx, 1);
  delete chats[id];
  io.emit('order-deleted', id);
  res.json({ message: 'Order deleted' });
});

app.get('/api/chats/:orderId', (req, res) => {
  const id = req.params.orderId;
  res.json(chats[id] || []);
});

app.post('/api/chats/:orderId', (req, res) => {
  const id = req.params.orderId;
  const { from, text } = req.body;
  if(!chats[id]) chats[id] = [];
  const msg = { from: from || 'unknown', text: text || '', ts: new Date().toISOString() };
  chats[id].push(msg);
  io.to(id).emit('new-message', { orderId: id, message: msg });
  res.json(msg);
});

io.on('connection', socket => {
  socket.on('join', orderId => {
    if(orderId) socket.join(orderId);
  });
  socket.on('send-message', ({ orderId, from, text }) => {
    if(!orderId) return;
    const msg = { from: from || 'unknown', text: text || '', ts: new Date().toISOString() };
    if(!chats[orderId]) chats[orderId] = [];
    chats[orderId].push(msg);
    io.to(orderId).emit('new-message', { orderId, message: msg });
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`CYNETWORK PISOWIFI running on http://localhost:${PORT}`));
