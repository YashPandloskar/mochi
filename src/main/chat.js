const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const theme = require('../theme');

// Chat with Claude through the Claude Code command line (`claude -p`), using your own login and plan.
// One process per message; the conversation continues with --resume. Tools are off, and your personal
// settings, plugins and hooks are not loaded (--setting-sources ""), so a chat can never trigger mochi's
// Working / Done panels. The message goes to the CLI on standard input.
//
// Events: { type: 'start' } { type: 'delta', text } { type: 'done', text } { type: 'error', message } { type: 'stopped' }
class Chat extends EventEmitter {
  constructor({ claudePath, prefixArgs = [], cwd } = {}) {
    super();
    this.claudePath = claudePath || this.findClaude();
    this.prefixArgs = prefixArgs; // tests run a fake claude through node
    this.cwd = cwd || path.join(os.tmpdir(), 'mochi-chat'); // neutral folder: no project files, no CLAUDE.md
    this.sessionId = null;
    this.proc = null;
    this.busy = false;
    this.stopped = false;
  }

  findClaude() {
    const local = path.join(os.homedir(), '.local', 'bin', 'claude.exe');
    return fs.existsSync(local) ? local : 'claude';
  }

  // image (optional): { data: base64, mediaType: 'image/jpeg' | 'image/png' }, e.g. a screenshot
  send(text, image) {
    text = String(text || '').trim();
    const okImage = image && /^image\/(jpeg|png)$/.test(image.mediaType) && typeof image.data === 'string' && image.data.length > 0 && image.data.length <= theme.chat.maxImageBytes;
    if (image && !okImage) return false;
    if ((!text && !okImage) || this.busy || text.length > theme.chat.maxChars) return false;
    if (okImage && !text) text = theme.chat.screenPrompt;
    fs.mkdirSync(this.cwd, { recursive: true });
    const first = !this.sessionId;
    if (first) this.sessionId = crypto.randomUUID();
    const args = [
      ...this.prefixArgs,
      '-p',
      ...(okImage ? ['--input-format', 'stream-json'] : []),
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--tools', '',
      '--setting-sources', '',
      '--append-system-prompt', theme.chat.systemPrompt,
      first ? '--session-id' : '--resume', this.sessionId,
    ];
    this.busy = true;
    this.stopped = false;
    this.emit('event', { type: 'start' });

    let proc;
    try {
      proc = spawn(this.claudePath, args, { cwd: this.cwd, env: { ...process.env, MOCHI_CHAT: '1' }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
      return this.fail(first, `Could not start Claude: ${e.message}`);
    }
    this.proc = proc;

    let buf = '';
    let streamed = '';
    let result = null;
    let err = '';
    let handled = false;

    // no output for a long time: give up
    const timer = setTimeout(() => {
      err = 'Claude took too long to answer.';
      proc.kill();
    }, theme.chat.thinkingTimeoutSeconds * 1000);

    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (d) => {
      timer.refresh();
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        let o;
        try {
          o = JSON.parse(line);
        } catch {
          continue;
        }
        if (o.type === 'stream_event' && o.event && o.event.type === 'content_block_delta' && o.event.delta && o.event.delta.type === 'text_delta') {
          streamed += o.event.delta.text;
          this.emit('event', { type: 'delta', text: o.event.delta.text });
        } else if (o.type === 'result') result = o;
      }
    });
    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', (d) => (err += d));
    proc.stdin.on('error', () => {});
    // With a picture the message goes as one JSON line (image block + text); otherwise as plain text.
    proc.stdin.end(
      okImage
        ? JSON.stringify({
            type: 'user',
            message: { role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } }, { type: 'text', text }] },
          }) + '\n'
        : text
    );

    proc.on('error', (e) => {
      clearTimeout(timer);
      handled = true;
      this.proc = null;
      this.fail(first, e.code === 'ENOENT' ? 'Claude Code is not installed (the "claude" command was not found).' : `Could not run Claude: ${e.message}`);
    });
    proc.on('exit', (code) => {
      clearTimeout(timer);
      this.proc = null;
      if (handled) return;
      this.busy = false;
      if (this.stopped) {
        this.emit('event', { type: 'stopped', text: streamed });
      } else if (result && !result.is_error) {
        this.emit('event', { type: 'done', text: result.result || streamed });
      } else {
        // a failed first message leaves no usable session: start fresh next time
        if (first) this.sessionId = null;
        this.emit('event', { type: 'error', message: this.explain(result && result.result, err, code) });
      }
    });
    return true;
  }

  explain(resultText, stderr, code) {
    const t = `${resultText || ''} ${stderr || ''}`;
    if (/not logged in|please run \/login|authentication|credentials|401/i.test(t)) {
      return 'Claude is not signed in. Open a terminal, run "claude", sign in once, then try again.';
    }
    if (/rate limit|usage limit|limit reached/i.test(t)) return 'You have reached your Claude usage limit for now.';
    if (/too long/i.test(t)) return 'Claude took too long to answer.';
    return (resultText || stderr || `Claude stopped unexpectedly (code ${code}).`).trim().slice(0, 300);
  }

  fail(first, message) {
    this.busy = false;
    if (first) this.sessionId = null;
    this.emit('event', { type: 'error', message });
    return false;
  }

  stop() {
    if (!this.proc) return;
    this.stopped = true;
    try {
      this.proc.kill();
    } catch {}
  }

  // New chat: forget the conversation
  reset() {
    this.stop();
    this.sessionId = null;
  }
}

module.exports = Chat;
