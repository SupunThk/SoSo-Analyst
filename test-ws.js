const WebSocket = require('ws');

const urls = [
  'wss://mainnet-gw.sodex.dev/ws',
  'wss://mainnet-gw.sodex.dev/v1/ws',
  'wss://mainnet-gw.sodex.dev/ws/v1',
  'wss://stream.sodex.dev/ws'
];

function testUrl(url) {
  return new Promise((resolve) => {
    console.log(`Testing ${url}...`);
    const ws = new WebSocket(url);
    
    ws.on('open', () => {
      console.log(`SUCCESS: Connected to ${url}`);
      
      const sub = {
        op: "subscribe",
        params: {
          channel: "candles",
          symbols: ["BTC-USD"],
          interval: "1m"
        }
      };
      
      ws.send(JSON.stringify(sub));
      console.log(`Sent subscription to ${url}`);
    });
    
    ws.on('message', (data) => {
      console.log(`[${url}] MESSAGE:`, data.toString());
      ws.close();
      resolve(true);
    });
    
    ws.on('error', (err) => {
      console.log(`[${url}] ERROR:`, err.message);
      resolve(false);
    });
    
    ws.on('close', () => {
      resolve(false);
    });

    setTimeout(() => {
      ws.close();
      resolve(false);
    }, 5000);
  });
}

async function run() {
  for (const url of urls) {
    const success = await testUrl(url);
    if (success) break;
  }
}

run();
