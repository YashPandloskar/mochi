// Small, safe markdown renderer for chat answers: paragraphs, lists, headings, **bold**, *italic*,
// `code` and fenced code blocks. Everything is HTML-escaped first, links are shown as plain text,
// and no raw HTML from the answer is ever inserted.
//   Md.render(text) -> HTML string
(() => {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // inline styles on already-escaped text
  function inline(s) {
    const codes = [];
    s = s.replace(/`([^`\n]+)`/g, (_m, c) => `\u0000${codes.push(c) - 1}\u0000`); // protect inline code from the other rules
    s = s.replace(/\[([^\]\n]+)\]\((?:[^)\n]+)\)/g, '<span class="lnk">$1</span>'); // links: text only
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s).,!?:;])/g, '$1<em>$2</em>');
    s = s.replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?:;])/g, '$1<em>$2</em>');
    return s.replace(/\u0000(\d+)\u0000/g, (_m, i) => `<code>${codes[Number(i)]}</code>`);
  }

  function block(lines) {
    if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) {
      return '<ul>' + lines.map((l) => `<li>${inline(l.replace(/^\s*[-*•]\s+/, ''))}</li>`).join('') + '</ul>';
    }
    if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
      return '<ol>' + lines.map((l) => `<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ''))}</li>`).join('') + '</ol>';
    }
    if (/^#{1,6}\s+/.test(lines[0])) {
      const head = `<p class="h">${inline(lines[0].replace(/^#{1,6}\s+/, ''))}</p>`;
      return head + (lines.length > 1 ? block(lines.slice(1)) : '');
    }
    return `<p>${lines.map(inline).join('<br>')}</p>`;
  }

  function render(text) {
    const out = [];
    // split off fenced code blocks (an unfinished block while streaming is shown as code too)
    const parts = String(text || '').replace(/\r\n/g, '\n').split(/```/);
    parts.forEach((part, i) => {
      if (i % 2 === 1) {
        const code = part.replace(/^[^\n]*\n/, ''); // drop the language tag line
        out.push(`<pre><code>${esc(code.replace(/\n$/, ''))}</code></pre>`);
        return;
      }
      for (const chunk of esc(part).split(/\n{2,}/)) {
        const lines = chunk.split('\n').filter((l) => l.trim() !== '');
        if (!lines.length) continue;
        // a list or heading directly after a paragraph line, in the same chunk
        let run = [];
        const flush = () => run.length && (out.push(block(run)), (run = []));
        for (const l of lines) {
          const isList = /^\s*([-*•]|\d+[.)])\s+/.test(l);
          const prevList = run.length && /^\s*([-*•]|\d+[.)])\s+/.test(run[0]);
          const isHead = /^#{1,6}\s+/.test(l);
          if (isHead || (run.length && isList !== prevList)) flush();
          run.push(l);
          if (isHead) flush();
        }
        flush();
      }
    });
    return out.join('');
  }

  const api = { render };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.Md = api;
})();
