const WebSocket = require('ws');
console.log('Testing Jetstream...');
const ws = new WebSocket('wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.like');
ws.on('open', () => { console.log('CONNECTED'); });
ws.on('message', (d) => { console.log('MSG:', JSON.parse(d).kind); });
ws.on('error', (e) => { console.log('ERROR:', e.message); });
ws.on('close', () => { console.log('CLOSED'); process.exit(0); });
setTimeout(() => { console.log('Test complete'); ws.close(); }, 5000);
