const fs = require('fs');
const http = require('http');

const file = fs.readFileSync('public/images/package2.svg');
const boundary = '----NodeBoundary' + Math.random().toString(16).slice(2);
let body = '';
function appendField(name, value){
  body += '--' + boundary + '\r\n';
  body += 'Content-Disposition: form-data; name="' + name + '"\r\n\r\n';
  body += value + '\r\n';
}
appendField('fullName', 'Upload Test');
appendField('packageId', 'Pro');
appendField('price', '120');
appendField('contactNumber', '09123456789');
body += '--' + boundary + '\r\n';
body += 'Content-Disposition: form-data; name="proof"; filename="package2.svg"\r\n';
body += 'Content-Type: image/svg+xml\r\n\r\n';

const pre = Buffer.from(body, 'utf8');
const post = Buffer.from('\r\n--' + boundary + '--\r\n', 'utf8');
const data = Buffer.concat([pre, file, post]);

const opts = {
  hostname: 'localhost',
  port: 4000,
  path: '/api/orders',
  method: 'POST',
  headers: {
    'Content-Type': 'multipart/form-data; boundary=' + boundary,
    'Content-Length': data.length
  }
};

const req = http.request(opts, res => {
  let r = '';
  res.on('data', c => r += c);
  res.on('end', () => {
    try{
      console.log('Response:', r);
    }catch(e){ console.log('Done'); }
  });
});
req.on('error', e => console.error('Error:', e.message));
req.write(data);
req.end();
