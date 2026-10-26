'use strict';

const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { cleanupDirectory } = require('./server-fixture.cjs');

const combinations = [
  { hexo: 'hexo7', theme: 'anzhiyu', root: '/' },
  { hexo: 'hexo8', theme: 'anzhiyu', root: '/blog/' },
  { hexo: 'hexo7', theme: 'solitude', root: '/blog/' },
  { hexo: 'hexo8', theme: 'solitude', root: '/' }
];
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function start(options) {
  const child = fork(path.join(__dirname, 'server-fixture.cjs'), [
    '--hexo', options.hexo, '--theme', options.theme, '--root', options.root
  ], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true });
  let directory;
  let output = '';
  child.stdout.on('data', chunk => { output = (output + chunk).slice(-16000); });
  child.stderr.on('data', chunk => { output = (output + chunk).slice(-16000); });
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  const close = async () => {
    if (child.exitCode === null && child.signalCode === null) {
      if (child.connected) child.send({ type: 'shutdown' });
      const ended = await new Promise(resolve => {
        const timeout = setTimeout(() => resolve(false), 10000);
        exited.then(() => { clearTimeout(timeout); resolve(true); });
      });
      if (!ended) {
        child.kill('SIGKILL');
        await exited;
      }
    }
    if (directory) await cleanupDirectory(directory);
  };
  try {
    const ready = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Fixture startup timed out\n' + output)), 90000);
      child.on('message', message => {
        if (message.type === 'created') directory = message.directory;
        if (message.type === 'ready') {
          clearTimeout(timeout);
          resolve(message);
        }
      });
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('exit', (code, signal) => {
        clearTimeout(timeout);
        reject(new Error('Fixture exited before ready (' + code + ', ' + signal + ')\n' + output));
      });
    });
    return { ...ready, close };
  } catch (error) {
    await close();
    throw error;
  }
}

async function response(url, expected = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const result = await fetch(url, { signal: controller.signal });
    assert.equal(result.status, 200, url + ' should be served by Hexo');
    if (expected.mime) assert.match(result.headers.get('content-type') || '', expected.mime,
      url + ' should have the resource MIME type');
    const body = Buffer.from(await result.arrayBuffer());
    if (expected.minBytes) assert.ok(body.length >= expected.minBytes,
      url + ' should contain a complete resource, got ' + body.length + ' bytes');
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

async function inspectThemeAssets(html, fixture) {
  const document = new JSDOM(html).window.document;
  let cssUrl;
  let scriptUrl;
  let utilsUrl;
  try {
    const stylesheet = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).find(link =>
      /\/css\/index\.css(?:\?|$)/.test(link.getAttribute('href') || ''));
    const script = Array.from(document.querySelectorAll('script[src]')).find(node =>
      /\/js\/main\.js(?:\?|$)/.test(node.getAttribute('src') || ''));
    const utils = Array.from(document.querySelectorAll('script[src]')).find(node =>
      /\/js\/utils\.js(?:\?|$)/.test(node.getAttribute('src') || ''));
    assert.ok(stylesheet && script && utils, 'theme links its CSS, main script and utilities');
    cssUrl = new URL(stylesheet.getAttribute('href'), fixture.baseUrl).href;
    scriptUrl = new URL(script.getAttribute('src'), fixture.baseUrl).href;
    utilsUrl = new URL(utils.getAttribute('src'), fixture.baseUrl).href;
    for (const url of [cssUrl, scriptUrl, utilsUrl]) {
      assert.equal(new URL(url).origin, new URL(fixture.baseUrl).origin, 'theme assets served locally');
      assert.ok(new URL(url).pathname.startsWith(fixture.root), 'theme assets respect the root path');
    }
  } finally {
    document.defaultView.close();
  }
  const css = (await response(cssUrl, { mime: /text\/css/i, minBytes: 10000 })).toString();
  assert.ok(css.includes('#aside-content') && css.includes('.sticky_layout'),
    'theme stylesheet includes the real sidebar layout');
  const script = (await response(scriptUrl, { mime: /(?:application|text)\/javascript/i, minBytes: 10000 })).toString();
  assert.ok(script.includes(fixture.theme === 'solitude' ? 'Solitude' : 'window.refreshFn'),
    'the correct theme runtime is served');
  await response(utilsUrl, { mime: /(?:application|text)\/javascript/i, minBytes: 1000 });
  if (fixture.theme === 'solitude') {
    const visited = new Set([scriptUrl]);
    const modules = async (source, parentUrl) => {
      const pattern = /(?:^|\n)\s*(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"](\.[^'"]+)['"]/g;
      for (const match of source.matchAll(pattern)) {
        const url = new URL(match[1], parentUrl).href;
        if (visited.has(url)) continue;
        visited.add(url);
        const content = (await response(url, { mime: /(?:application|text)\/javascript/i, minBytes: 1 })).toString();
        await modules(content, url);
      }
    };
    await modules(script, scriptUrl);
    assert.ok(visited.size > 4, 'Solitude ES module imports were checked');
  }
}

function inspect(html, fixture, sidebar) {
  assert.equal(html.split('<!-- electric-clock:head -->').length - 1, 1, 'one head injection');
  assert.equal(html.split('<!-- electric-clock:body -->').length - 1, 1, 'one body injection');
  const dom = new JSDOM(html);
  try {
    const document = dom.window.document;
    const clockScripts = Array.from(document.querySelectorAll('script[src]')).filter(script =>
      script.getAttribute('src') === fixture.root + 'electric-clock/clock.js');
    const clockStyles = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).filter(link =>
      link.getAttribute('href') === fixture.root + 'electric-clock/clock.min.css');
    assert.equal(clockScripts.length, 1, 'one script with correct subdirectory root');
    assert.equal(clockStyles.length, 1, 'one style with correct subdirectory root');
    const target = document.querySelector('#aside-content .sticky_layout');
    // Solitude's page template can retain the sidebar DOM inside .hide-aside.
    // That theme-level hidden state is equivalent to omitting the sidebar.
    assert.equal(Boolean(target && !target.closest('.hide-aside')), sidebar,
      'respect the theme sidebar configuration');
  } finally {
    dom.window.close();
  }
}

async function check(options) {
  const fixture = await start(options);
  try {
    const home = (await response(fixture.baseUrl)).toString();
    const post = (await response(fixture.postUrl)).toString();
    const about = (await response(fixture.aboutUrl)).toString();
    inspect(home, fixture, true);
    inspect(post, fixture, true);
    inspect(about, fixture, false);
    await inspectThemeAssets(home, fixture);
    const runtime = (await response(fixture.baseUrl + 'electric-clock/clock.js')).toString();
    assert.ok(runtime.includes('__hexoElectricClock'), 'runtime served from the plugin route');
    const style = (await response(fixture.baseUrl + 'electric-clock/clock.min.css')).toString();
    assert.ok(style.includes('.card-clock'), 'scoped clock stylesheet served');
    assert.ok(!/url\(\s*["']?https?:/i.test(style), 'stylesheet does not fetch remote fonts');
    const font = await response(fixture.baseUrl + 'electric-clock/fonts/qweather-icons.woff2');
    assert.equal(font.subarray(0, 4).toString(), 'wOF2', 'local weather icon font is intact');
    await response(fixture.baseUrl + 'electric-clock/fonts/qweather-icons.woff');
    await response(fixture.baseUrl + 'electric-clock/fonts/qweather-icons.ttf');
    const marker = 'clock-watch-' + Date.now();
    await fs.appendFile(fixture.postFile, '\n\n' + marker + '\n');
    const deadline = Date.now() + 30000;
    let updated;
    do {
      await delay(250);
      updated = (await response(fixture.postUrl)).toString();
    } while (!updated.includes(marker) && Date.now() < deadline);
    assert.ok(updated.includes(marker), 'hexo server watch reflects the edited article');
    inspect(updated, fixture, true);
    inspect((await response(fixture.baseUrl)).toString(), fixture, true);
    console.log('PASS Hexo ' + fixture.hexo + ' + ' + fixture.theme + ' ' + fixture.themeVersion +
      ' root=' + fixture.root + ' (home/post/about/theme CSS+JS/modules/assets/fonts/watch)');
  } finally {
    await fixture.close();
    await assert.rejects(fs.access(fixture.directory), { code: 'ENOENT' }, 'fixture removed');
  }
}

(async () => {
  for (const options of combinations) await check(options);
  console.log('All four Hexo/theme server fixtures passed; temporary sites and servers removed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
