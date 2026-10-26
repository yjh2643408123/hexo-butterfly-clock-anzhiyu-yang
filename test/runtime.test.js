'use strict';

const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, '../lib/clock.js'), 'utf8');
const minSource = fs.readFileSync(path.join(__dirname, '../lib/clock.min.js'), 'utf8');
const sidebar = '<aside id="aside-content"><div class="sticky_layout"></div></aside>';
const plainSidebar = '<aside id="aside-content"></aside>';
const weather = { code: '200', now: { temp: '23', icon: '100', text: '晴', humidity: '50', windDir: '东风' } };
const response = data => ({ ok: true, json: async () => data });
const routes = url => url.includes('/v3/ip?') ? response({ status: '1', rectangle: '10,20;11,21', city: '测试城市' }) :
  url.includes('/geocode/regeo?') ? response({ status: '1', regeocode: { addressComponent: { city: [], province: '备用城市' } } }) :
  response(weather);

function setup(t, options = {}) {
  const dom = new JSDOM('<!doctype html><html><body>' + (options.body === undefined ? sidebar : options.body) + '</body></html>', {
    runScripts: 'outside-only', url: options.url || 'https://example.test/'
  });
  const w = dom.window;
  let now = Date.UTC(2026, 0, 1, 5, 0, 0), id = 0;
  const intervals = new Map(), timeouts = new Map(), calls = [], bindings = new Map();
  const NativeDate = w.Date;
  w.Date = class extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  };
  w.setInterval = fn => { intervals.set(++id, fn); return id; };
  w.clearInterval = n => intervals.delete(n);
  w.setTimeout = (fn, ms) => { timeouts.set(++id, { fn, ms }); return id; };
  w.clearTimeout = n => timeouts.delete(n);
  w.fetch = (url, init) => { calls.push(url); return Promise.resolve().then(() => (options.fetch || routes)(url, init)); };
  if (options.legacy) Object.assign(w, options.legacy);
  else w.__hexoElectricClockConfig = Object.assign({
    root: '/', enablePage: 'all', exclude: [], layout: { type: 'auto' },
    weatherKey: 'test-weather-key', mapKey: 'test-map-key', rectangle: '10,20', fixed: false
  }, options.config);
  const nativeAdd = w.document.addEventListener.bind(w.document);
  w.document.addEventListener = (type, ...args) => {
    bindings.set(type, (bindings.get(type) || 0) + 1);
    nativeAdd(type, ...args);
  };
  const h = {
    w, dom, intervals, timeouts, calls, bindings,
    run(code = source) { w.eval(code); },
    event(name) { w.document.dispatchEvent(new w.Event(name)); },
    nav(url = '/posts/example.html', body = sidebar, flavor = 'pjax') {
      this.event(flavor === 'pjax' ? 'pjax:send' : 'solitude:beforeNavigate');
      w.history.replaceState({}, '', url);
      w.document.body.innerHTML = body;
      this.event(flavor === 'pjax' ? 'pjax:complete' : 'solitude:afterNavigate');
    },
    advance(ms) { now += ms; for (const fn of [...intervals.values()]) fn(); },
    get state() { return w.__hexoElectricClock; },
    get clockCount() { return w.document.querySelectorAll('#hexo_electric_clock').length; }
  };
  t.after(() => { if (h.state) h.state.stop(); dom.window.close(); });
  if (!options.defer) h.run();
  return h;
}

async function flush() { for (let i = 0; i < 15; i++) await new Promise(resolve => setImmediate(resolve)); }
const count = (h, fragment) => h.calls.filter(url => url.includes(fragment)).length;

test('replayed source and compatibility entry keep one card, listener set and timer', async t => {
  const h = setup(t);
  for (let i = 0; i < 8; i++) h.run(i % 2 ? source : minSource);
  await flush();
  assert.equal(h.clockCount, 1);
  assert.equal(h.intervals.size, 1);
  assert.equal(h.bindings.get('pjax:complete'), 1);
  assert.equal(h.bindings.get('solitude:ready'), 1);
  assert.equal(count(h, '/weather/now'), 1);
  assert.equal(h.state.nodes.weatherText.textContent, ' 晴 23 ℃');
  const first = h.state.nodes.time.textContent;
  h.advance(1000);
  assert.notEqual(h.state.nodes.time.textContent, first);
  assert.equal(h.timeouts.size, 0);
});

test('PJAX and Solitude round trips reuse weather and remove cards on pages without sidebars', async t => {
  const h = setup(t);
  await flush();
  for (const flavor of ['pjax', 'solitude']) {
    h.nav('/about/', '<article>no sidebar</article>', flavor);
    await flush();
    assert.equal(h.clockCount, 0);
    assert.equal(h.intervals.size, 0);
    h.nav('/posts/example.html', sidebar, flavor);
    h.run();
    h.event('solitude:ready');
    await flush();
    assert.equal(h.clockCount, 1);
    assert.equal(h.intervals.size, 1);
    assert.equal(h.state.nodes.location.textContent, '测试城市');
  }
  assert.equal(count(h, '/weather/now'), 1);
  assert.equal(count(h, '/v3/ip?'), 1);
});

test('late sidebars and repeated Solitude ready events recover a single mounted clock', async t => {
  const h = setup(t, { body: '<article>loading</article>' });
  assert.equal(h.clockCount, 0);
  h.event('solitude:afterNavigate');
  h.w.document.body.innerHTML = sidebar;
  await flush();
  assert.equal(h.clockCount, 1);
  h.event('solitude:ready');
  h.event('solitude:ready');
  await flush();
  assert.equal(h.intervals.size, 1);
  assert.equal(count(h, '/weather/now'), 1);
});

test('Solitude hidden sidebars do not mount or request weather and recover when visible', async t => {
  const h = setup(t, { body: '<main class="hide-aside">' + sidebar + '</main>' });
  await flush();
  assert.equal(h.clockCount, 0);
  assert.equal(h.intervals.size, 0);
  assert.equal(h.calls.length, 0);
  h.w.__hexoElectricClockConfig.layout = { type: 'id', name: 'aside-content' };
  h.event('solitude:ready');
  await flush();
  assert.equal(h.clockCount, 0);
  assert.equal(h.calls.length, 0);
  h.nav('/posts/example.html', sidebar, 'solitude');
  await flush();
  assert.equal(h.clockCount, 1);
  assert.equal(h.intervals.size, 1);
});

test('auto layout falls back to the sidebar while custom id, class and selector respect index', async t => {
  const h = setup(t, { body: plainSidebar });
  await flush();
  assert.equal(h.state.card.closest('#aside-content').id, 'aside-content');
  h.w.__hexoElectricClockConfig.layout = { type: 'class', name: 'slot', index: 1 };
  h.nav('/posts/example.html', '<div class="slot"></div><div id="chosen" class="slot"></div>');
  await flush();
  assert.equal(h.state.card.closest('#chosen').id, 'chosen');
  h.w.__hexoElectricClockConfig.layout = { type: 'selector', name: 'section[data-slot]', index: 1 };
  h.nav('/posts/example.html', '<section data-slot></section><section id="selected" data-slot></section>');
  assert.equal(h.state.card.closest('#selected').id, 'selected');
  h.w.__hexoElectricClockConfig.layout = { type: 'id', name: 'custom' };
  h.nav('/posts/example.html', '<div id="custom"></div>');
  assert.equal(h.state.card.closest('#custom').id, 'custom');
  h.w.__hexoElectricClockConfig.layout = { type: 'selector', name: '[' };
  assert.doesNotThrow(() => h.state.mount());
  assert.equal(h.clockCount, 0);
});

test('root-only enable respects a site subdirectory and slash exclusion retains legacy meaning', async t => {
  const h = setup(t, { url: 'https://example.test/blog/', config: { root: '/blog/', enablePage: '/' } });
  await flush();
  assert.equal(h.clockCount, 1);
  h.nav('/blog/posts/example.html');
  await flush();
  assert.equal(h.clockCount, 0);
  h.w.__hexoElectricClockConfig.enablePage = 'all';
  h.w.__hexoElectricClockConfig.exclude = ['/'];
  h.state.mount();
  assert.equal(h.clockCount, 0);
  h.nav('/blog/');
  await flush();
  assert.equal(h.clockCount, 0);
  h.w.__hexoElectricClockConfig.enablePage = ['/posts/', '/tags/'];
  h.w.__hexoElectricClockConfig.exclude = ['/posts/private/'];
  h.nav('/blog/posts/private/entry.html');
  assert.equal(h.clockCount, 0);
  h.nav('/blog/posts/public.html');
  assert.equal(h.clockCount, 1);
  h.nav('/blog/postscript/');
  assert.equal(h.clockCount, 0);
});

test('empty weather configuration never requests location and keeps local time working', async t => {
  const h = setup(t, { config: { weatherKey: '', mapKey: '', rectangle: '' } });
  await flush();
  assert.equal(h.calls.length, 0);
  assert.equal(h.state.nodes.weatherText.textContent, '天气未配置');
  const before = h.state.nodes.time.textContent;
  h.advance(2000);
  assert.notEqual(h.state.nodes.time.textContent, before);
});

test('scalar enable_page keeps exact matching and legacy exclusions keep substring matching', async t => {
  const h = setup(t, { url: 'https://example.test/categories/', config: { enablePage: '/categories/' } });
  await flush();
  assert.equal(h.clockCount, 1);
  h.nav('/categories/example/');
  assert.equal(h.clockCount, 0);
  h.w.__hexoElectricClockConfig.enablePage = ['/categories/'];
  h.state.mount();
  assert.equal(h.clockCount, 1);
  h.w.__hexoElectricClockConfig.exclude = ['example'];
  h.state.mount();
  assert.equal(h.clockCount, 0);
});

test('subdirectory filters accept both full site paths and root-relative paths', async t => {
  const h = setup(t, { url: 'https://example.test/blog/categories/', config: { root: '/blog/', enablePage: '/blog/categories/' } });
  await flush();
  assert.equal(h.clockCount, 1);
  h.w.__hexoElectricClockConfig.enablePage = '/categories/';
  h.state.mount();
  assert.equal(h.clockCount, 1);
  h.w.__hexoElectricClockConfig.enablePage = ['/blog/posts/'];
  h.nav('/blog/posts/example.html');
  assert.equal(h.clockCount, 1);
  h.w.__hexoElectricClockConfig.exclude = ['/blog/posts/'];
  h.state.mount();
  assert.equal(h.clockCount, 0);
  h.w.__hexoElectricClockConfig.exclude = ['/posts/'];
  h.state.mount();
  assert.equal(h.clockCount, 0);
  h.w.__hexoElectricClockConfig.exclude = [];
  h.w.__hexoElectricClockConfig.enablePage = ['/posts/'];
  h.state.mount();
  assert.equal(h.clockCount, 1);
});

test('coordinates work without a map key and support a dedicated weather host and path', async t => {
  const h = setup(t, { config: { mapKey: '', qweatherHost: 'weather.example.test', weatherPath: '/custom/now' } });
  await flush();
  assert.equal(h.calls.length, 1);
  const url = new URL(h.calls[0]);
  assert.equal(url.origin, 'https://weather.example.test');
  assert.equal(url.pathname, '/custom/now');
  assert.equal(url.searchParams.get('location'), '10,20');
  assert.equal(url.searchParams.get('key'), 'test-weather-key');
  assert.equal(h.state.nodes.location.textContent, '默认位置');
});

test('failed IP lookup uses configured fallback coordinates and fixed mode skips IP', async t => {
  const h = setup(t, { fetch: url => url.includes('/v3/ip?') ? response({ status: '1', rectangle: [], city: [] }) : routes(url) });
  await flush();
  assert.equal(count(h, '/v3/ip?'), 1);
  assert.equal(count(h, '/geocode/regeo?'), 1);
  assert.equal(h.state.nodes.location.textContent, '备用城市');
  h.w.__hexoElectricClockConfig.fixed = true;
  h.nav();
  await flush();
  assert.equal(count(h, '/v3/ip?'), 1);
  assert.equal(count(h, '/geocode/regeo?'), 2);
});

test('slow results cannot write to old DOM and an in-flight request survives navigation', async t => {
  let release;
  const delayed = new Promise(resolve => { release = resolve; });
  const h = setup(t, { fetch: url => url.includes('/weather/now') ? delayed : routes(url) });
  await flush();
  const old = h.state.card, oldHTML = old.innerHTML;
  h.nav('/about/', '<article>no sidebar</article>');
  await flush();
  h.nav('/archives/', plainSidebar, 'solitude');
  await flush();
  assert.equal(count(h, '/weather/now'), 1);
  release(response(weather));
  await flush();
  assert.equal(old.innerHTML, oldHTML);
  assert.equal(h.state.nodes.weatherText.textContent, ' 晴 23 ℃');
  assert.equal(h.intervals.size, 1);
});

test('expired cache fetches again and changed configuration cannot display an older response', async t => {
  const h = setup(t);
  await flush();
  h.advance(10 * 60 * 1000 + 1);
  h.nav();
  await flush();
  assert.equal(count(h, '/weather/now'), 2);
  h.w.__hexoElectricClockConfig.weatherKey = '';
  h.state.mount();
  assert.equal(h.state.nodes.weatherText.textContent, '天气未配置');
  assert.equal(h.intervals.size, 1);
});

test('errors and request timeouts leave a functioning clock with a clear weather status', async t => {
  const h = setup(t, { config: { mapKey: '' }, fetch: () => new Promise(() => {}) });
  await flush();
  assert.equal(h.timeouts.size, 1);
  for (const [id, timeout] of h.timeouts) { h.timeouts.delete(id); timeout.fn(); }
  await flush();
  assert.equal(h.state.nodes.weatherText.textContent, '天气不可用');
  const before = h.state.nodes.time.textContent;
  h.advance(1000);
  assert.notEqual(h.state.nodes.time.textContent, before);
  assert.equal(h.intervals.size, 1);
});

test('legacy globals and pre-injected duplicate cards remain compatible', async t => {
  const card = '<div class="card-widget card-clock"><div id="hexo_electric_clock"></div></div>';
  const h = setup(t, {
    body: '<div id="legacy">' + card + card + '</div>',
    legacy: { epage: 'all', elist: [], qweather_key: 'legacy-weather-key', gaud_map_key: '', clock_rectangle: '10,20', clock_default_rectangle_enable: 'true' }
  });
  await flush();
  assert.equal(h.clockCount, 1);
  assert.equal(h.w.document.querySelectorAll('.card-clock').length, 1);
  assert.equal(h.state.card.closest('#legacy').id, 'legacy');
  assert.equal(h.state.nodes.location.textContent, '默认位置');
  assert.equal(h.calls.length, 1);
  h.run();
  assert.equal(h.intervals.size, 1);
});

test('malformed custom card markup and absent layout do not create incomplete cards', async t => {
  const h = setup(t, { config: { html: '<div class="card-clock">missing inner clock</div>' } });
  await flush();
  assert.equal(h.clockCount, 0);
  assert.equal(h.w.document.querySelectorAll('.card-clock').length, 0);
  assert.equal(h.intervals.size, 0);
  assert.equal(h.calls.length, 0);
});
