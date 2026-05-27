const ws = new WebSocket('wss://mainnet-gw.sodex.dev/ws/perps');

ws.onopen = () => {
  console.log('connected');
  ws.send(JSON.stringify({
    op: 'subscribe',
    params: {
      channel: 'l4Book',
      symbol: 'BTC-USD'
      // Omit level to use default
    }
  }));
};

ws.onmessage = (event) => {
  console.log(event.data);
  // close after first message to exit
  setTimeout(() => ws.close(), 1000);
};

ws.onerror = (err) => {
  console.error('error:', err);
};
