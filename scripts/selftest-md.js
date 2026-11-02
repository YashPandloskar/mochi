// Markdown renderer for chat answers: formatting and, above all, safety.   npm test
const assert = require('assert');
const { render } = require('../src/renderer/components/md');
let passed = 0;
const ok = (n) => console.log('  ok  ' + n) || passed++;

// safety: nothing from the answer can become real HTML
const evil = '<img src=x onerror=alert(1)> <script>alert(1)</script> [click](javascript:alert(1)) **<b>x</b>**';
const html = render(evil);
assert.ok(!/<img|<script|<b>|href=|onerror=\S*>/.test(html.replace(/<(p|strong|span|br)[^>]*>|<\/(p|strong|span)>/g, '')), html);
assert.ok(html.includes('&lt;img') && html.includes('&lt;script&gt;'));
assert.ok(!html.includes('href'), 'links are never real links');
assert.ok(html.includes('<span class="lnk">click</span>'));
ok('HTML in an answer is escaped; links are plain text');

const code = render('Here:\n```js\nconst a = "<b>1</b>" && 2;\n```\nDone');
assert.ok(code.includes('<pre><code>const a = &quot;&lt;b&gt;1&lt;/b&gt;&quot; &amp;&amp; 2;</code></pre>'), code);
assert.ok(!code.includes('js\n'), 'language tag is dropped');
ok('code blocks are escaped and keep their text');

assert.ok(render('```\nunfinished').includes('<pre><code>unfinished</code></pre>'));
ok('an unfinished code block (while streaming) renders');

assert.strictEqual(render('a **bold** and *italic* and _also_ with `x < y` code'), '<p>a <strong>bold</strong> and <em>italic</em> and <em>also</em> with <code>x &lt; y</code> code</p>');
ok('inline bold, italics and code');

assert.strictEqual(render('- one\n- two'), '<ul><li>one</li><li>two</li></ul>');
assert.strictEqual(render('1. first\n2) second'), '<ol><li>first</li><li>second</li></ol>');
ok('bullet and numbered lists');

assert.strictEqual(render('Plan:\n1. wake\n2. work\nThat is all'), '<p>Plan:</p><ol><li>wake</li><li>work</li></ol><p>That is all</p>');
ok('a list in the middle of a paragraph');

assert.strictEqual(render('## Title\nbody'), '<p class="h">Title</p><p>body</p>');
assert.strictEqual(render('one\n\ntwo\nthree'), '<p>one</p><p>two<br>three</p>');
ok('headings, paragraphs and line breaks');

assert.strictEqual(render(''), '');
assert.strictEqual(render(null), '');
assert.strictEqual(render('snake_case_name and 2*3*4'), '<p>snake_case_name and 2*3*4</p>');
ok('empty input and underscores/asterisks inside words are left alone');

console.log(`\n${passed} markdown checks passed`);
