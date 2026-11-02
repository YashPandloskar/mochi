const http = require('http');
const crypto = require('crypto');
const theme = require('../theme');

const MAX_BODY = 1024 * 1024;

function tokenOk(given, expected) {
  if (typeof given !== 'string') return false;
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

// The hook output Claude Code expects for a PermissionRequest decision.
function permissionOutput(decision) {
  if (decision === 'allow') {
    return { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } };
  }
  if (decision === 'deny') {
    return { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'deny', message: 'Denied from mochi' } } };
  }
  return null; // timeout / gone: print nothing, Claude Code shows its normal prompt
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// Listens on 127.0.0.1 only. Every request needs the shared token.
//   POST /event     hook JSON, returns immediately
//   POST /approval  PermissionRequest JSON, held open until Allow/Deny/timeout;
//                   the response body is exactly what the hook script should print
function start({ port, token, state }) {
  const hostOk = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);

  const server = http.createServer(async (req, res) => {
    const reply = (code, body = '') => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(body);
    };
    try {
      // Block browsers and DNS-rebinding: hook scripts send no Origin and use a loopback Host.
      if (req.headers.origin || !hostOk.has(req.headers.host)) return reply(403);
      if (!tokenOk(req.headers['x-mochi-token'], token)) return reply(401);

      if (req.method === 'GET' && req.url === '/health') return reply(200, '{"ok":true}');
      if (req.method === 'GET' && req.url === '/state') return reply(200, JSON.stringify(state.snapshot()));
      if (req.method !== 'POST') return reply(405);

      let ev;
      try {
        ev = JSON.parse(await readBody(req));
      } catch {
        return reply(400);
      }

      if (req.url === '/event') {
        state.handle(ev);
        return reply(200, '{}');
      }

      if (req.url === '/approval') {
        const { approval, promise } = state.requestApproval(ev);
        const timer = setTimeout(() => state.resolve(approval.id, 'timeout'), theme.timings.approvalTimeoutSeconds * 1000);
        // Hook process died (answered in the terminal, or Claude Code cancelled): drop the card.
        res.on('close', () => {
          if (!res.writableEnded) state.resolve(approval.id, 'gone');
        });
        const decision = await promise;
        clearTimeout(timer);
        const out = permissionOutput(decision);
        return reply(200, out ? JSON.stringify(out) : '');
      }

      return reply(404);
    } catch {
      if (!res.headersSent) reply(500);
    }
  });

  server.on('error', (err) => console.error('mochi server:', err.code || err.message));
  server.listen(port, '127.0.0.1');
  return server;
}

module.exports = { start, permissionOutput };
