// Evaluates a JavaScript expression inside the running mochi page (started with --remote-debugging-port=9333).
//   node scripts\cdp.js "document.title"
// Used by scripts\soak.ps1; handy for poking at the notch while it runs.
const expr = process.argv[2];
(async () => {
  const list = await (await fetch('http://127.0.0.1:9333/json')).json();
  const ws = new WebSocket(list[0].webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id === 1) {
      console.log(JSON.stringify(d.result.result.value ?? d.result, null, 1));
      ws.close();
    }
  };
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } }));
})();
