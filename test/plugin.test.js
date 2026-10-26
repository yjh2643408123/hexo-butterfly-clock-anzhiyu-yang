'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const test = require('node:test');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const HTML = '<!doctype html><html><head><title>Fixture</title></head><body><main>Content</main></body></html>';

function loadPlugin(siteConfig, themeConfig, root = '/') {
  const filters = new Map();
  const generators = new Map();
  const config = { root, url: `https://example.test${root}` };
  if (siteConfig !== undefined) config.electric_clock = siteConfig;
  const theme = { config: {} };
  if (themeConfig !== undefined) theme.config.electric_clock = themeConfig;
  const urlFor = function (url) {
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(url)) return url;
    return root + String(url).replace(/^\/+/, '');
  };
  const hexo = {
    config, theme, version: '8.1.2', base_dir: ROOT + path.sep,
    log: { warn() {}, info() {}, debug() {}, error() {} },
    extend: {
      filter: {
        register(name, fn, priority) {
          if (!filters.has(name)) filters.set(name, []);
          filters.get(name).push({ fn, priority });
        }
      },
      generator: { register(name, fn) { generators.set(name, fn); } },
      helper: { get(name) { return name === 'url_for' ? urlFor : undefined; } },
      injector: { register() { throw new Error('The plugin must not repeatedly register injectors'); } }
    }
  };
  const pluginRequire = createRequire(path.join(ROOT, 'index.js'));
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8'), {
    hexo, require: pluginRequire, __dirname: ROOT, __filename: path.join(ROOT, 'index.js'),
    module: { exports: {} }, exports: {}, Buffer, process, console, URL
  }, { filename: path.join(ROOT, 'index.js') });
  return {
    hexo, filters, generators,
    async render(input = HTML, page = { path: 'index.html' }) {
      let output = input;
      for (const { fn } of filters.get('after_render:html') || []) {
        const next = await fn.call(hexo, output, { page });
        if (next !== undefined) output = next;
      }
      return output;
    },
    async assets() {
      const result = await generators.get('electric_clock_assets').call(hexo, {});
      return result ? Array.from(result) : [];
    }
  };
}

function readBootstrap(html) {
  const window = {};
  const document = {
    readyState: 'complete',
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {}
  };
  window.document = document;
  const context = { window, document, console, URL, location: { pathname: '/' } };
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (/\bsrc\s*=/i.test(match[1])) continue;
    vm.runInNewContext(match[2], context, { filename: 'clock-bootstrap.js' });
  }
  assert.ok(window.__hexoElectricClockConfig, 'bootstrap should expose the clock configuration');
  return { config: window.__hexoElectricClockConfig, window };
}

async function routeBytes(route) {
  const data = await (typeof route.data === 'function' ? route.data() : route.data);
  if (typeof data === 'string' || Buffer.isBuffer(data)) return Buffer.from(data);
  const parts = [];
  for await (const chunk of data) parts.push(Buffer.from(chunk));
  return Buffer.concat(parts);
}

test('registers shared Hexo 7/8 public hooks once and publishes readable asset routes', async () => {
  const plugin = loadPlugin({ enable: true });
  assert.equal(plugin.filters.get('after_render:html').length, 1);
  assert.equal(plugin.generators.size, 1);
  assert.equal(plugin.filters.has('after_generate'), false);
  const routes = await plugin.assets();
  const required = [
    'electric-clock/clock.js', 'electric-clock/clock.min.css',
    'electric-clock/fonts/qweather-icons.ttf', 'electric-clock/fonts/qweather-icons.woff',
    'electric-clock/fonts/qweather-icons.woff2', 'electric-clock/loading.gif'
  ];
  for (const asset of required) assert.ok(routes.some(route => route.path === asset), `${asset} must be published`);
  for (const route of routes) {
    assert.match(route.path, /^electric-clock\//);
    assert.ok((await routeBytes(route)).length > 0, `${route.path} must have a readable body`);
  }
  assert.equal(new Set((await plugin.assets()).map(route => route.path)).size, routes.length);
});

test('missing, empty, and disabled configuration leave HTML and routes untouched', async () => {
  for (const config of [undefined, {}, { enable: false }]) {
    const plugin = loadPlugin(config);
    assert.equal(await plugin.render(), HTML);
    assert.equal((await plugin.assets()).length, 0);
  }
});

test('theme configuration works without a site-level electric_clock section', async () => {
  const plugin = loadPlugin(undefined, { enable: true, qweather_key: 'TEST_WEATHER_KEY' });
  const { config } = readBootstrap(await plugin.render());
  assert.equal(config.weatherKey, 'TEST_WEATHER_KEY');
  assert.match(await plugin.render(), /electric-clock\/clock\.js/);
});

test('site values override theme values while unspecified layout fields survive', async () => {
  const plugin = loadPlugin({ qweather_key: 'SITE_KEY', layout: { index: 2 } }, {
    enable: true, qweather_key: 'THEME_KEY', gaud_map_key: 'THEME_MAP_KEY',
    layout: { type: 'class', name: 'theme-sidebar', index: 0 }
  });
  const { config } = readBootstrap(await plugin.render());
  assert.equal(config.weatherKey, 'SITE_KEY');
  assert.equal(config.mapKey, 'THEME_MAP_KEY');
  assert.equal(config.layout.type, 'class');
  assert.equal(config.layout.name, 'theme-sidebar');
  assert.equal(config.layout.index, 2);
});

test('explicit site disable overrides a theme-level enable', async () => {
  const plugin = loadPlugin({ enable: false }, { enable: true });
  assert.equal(await plugin.render(), HTML);
  assert.equal((await plugin.assets()).length, 0);
});

test('a missing or null layout is safe and defaults contain no personal credentials or location', async () => {
  for (const layout of [undefined, null]) {
    const { config } = readBootstrap(await loadPlugin({ enable: true, layout }).render());
    assert.equal(config.weatherKey, '');
    assert.equal(config.mapKey, '');
    assert.equal(config.rectangle, '');
    assert.equal(config.enablePage, 'all');
    assert.ok(config.layout, 'runtime needs an automatic layout description');
  }
});

test('repeated HTML rendering is idempotent without duplicate tags or hooks', async () => {
  const plugin = loadPlugin({ enable: true });
  const once = await plugin.render();
  assert.equal(await plugin.render(once), once);
  assert.equal((once.match(/<!-- electric-clock:head -->/g) || []).length, 1);
  assert.equal((once.match(/<!-- electric-clock:body -->/g) || []).length, 1);
  assert.equal((once.match(/src=["'][^"']*electric-clock\/clock\.js/g) || []).length, 1);
  assert.equal(plugin.filters.get('after_render:html').length, 1);
});

test('custom templates, quotes, line breaks and script delimiters survive JSON bootstrap safely', async () => {
  const unusual = "'quote' \"double\"\nline\u2028separator\u2029end</script><script>window.unexpected=true</script>";
  const template = `<div id="hexo_electric_clock" data-note="custom">${unusual}</div>`;
  const plugin = loadPlugin({
    enable: true, temple_html: template, qweather_key: unusual,
    gaud_map_key: unusual, rectangle: unusual,
    layout: { type: 'id', name: unusual }
  });
  const output = await plugin.render();
  const { config, window } = readBootstrap(output);
  assert.equal(config.html, template);
  assert.equal(config.weatherKey, unusual);
  assert.equal(config.mapKey, unusual);
  assert.equal(config.rectangle, unusual);
  assert.equal(config.layout.name, unusual);
  assert.equal(window.unexpected, undefined);
  assert.equal(output.includes('\u2028'), false);
  assert.equal(output.includes('\u2029'), false);
});

test('root subdirectories prefix asset URLs without changing generator route paths', async () => {
  const plugin = loadPlugin({ enable: true }, undefined, '/blog/');
  const output = await plugin.render();
  const { config } = readBootstrap(output);
  assert.equal(config.root, '/blog/');
  assert.match(output, /["']\/blog\/electric-clock\/clock\.js["']/);
  assert.match(output, /["']\/blog\/electric-clock\/clock\.min\.css["']/);
  assert.equal(config.loading, '/blog/electric-clock/loading.gif');
  assert.ok((await plugin.assets()).every(route => route.path.startsWith('electric-clock/')));
});

test('custom local or remote resources override default includes and preserve legacy globals', async () => {
  const plugin = loadPlugin({
    enable: true, clock_js: '/custom-clock.js',
    clock_css: 'https://assets.example.test/custom-clock.css',
    loading: '/custom-loading.gif', qweather_key: 'CUSTOM_WEATHER_KEY',
    gaud_map_key: 'CUSTOM_MAP_KEY', rectangle: '120,30', default_rectangle: true
  }, undefined, '/blog/');
  const output = await plugin.render();
  const { config, window } = readBootstrap(output);
  assert.match(output, /["']\/blog\/custom-clock\.js["']/);
  assert.match(output, /https:\/\/assets\.example\.test\/custom-clock\.css/);
  assert.doesNotMatch(output, /src=["'][^"']*electric-clock\/clock\.js/);
  assert.equal(config.loading, '/blog/custom-loading.gif');
  assert.equal(window.qweather_key, 'CUSTOM_WEATHER_KEY');
  assert.equal(window.gaud_map_key, 'CUSTOM_MAP_KEY');
  assert.equal(window.clock_rectangle, '120,30');
  assert.equal(String(window.clock_default_rectangle_enable), 'true');
});

test('legacy page selectors are represented in configuration without empty exclusion entries', async () => {
  const plugin = loadPlugin({
    enable: true, enable_page: '/posts/example.html', exclude: ['/private/', '/drafts/'],
    layout: { type: 'id', name: 'right-sidebar', index: 0 }
  });
  const { config } = readBootstrap(await plugin.render());
  assert.equal(config.enablePage, '/posts/example.html');
  assert.deepEqual(Array.from(config.exclude), ['/private/', '/drafts/']);
  assert.equal(config.layout.type, 'id');
  assert.equal(config.layout.name, 'right-sidebar');
});

test('configuration is read again after watch cycles instead of captured during plugin load', async () => {
  const plugin = loadPlugin({ enable: true, qweather_key: 'BEFORE' });
  assert.equal(readBootstrap(await plugin.render()).config.weatherKey, 'BEFORE');
  plugin.hexo.config.electric_clock.qweather_key = 'AFTER';
  assert.equal(readBootstrap(await plugin.render()).config.weatherKey, 'AFTER');
  plugin.hexo.config.electric_clock.enable = false;
  assert.equal(await plugin.render(), HTML);
  assert.equal((await plugin.assets()).length, 0);
});

test('a custom QWeather hostname without a scheme is normalized to HTTPS', async () => {
  const plugin = loadPlugin({ enable: true, qweather_host: 'weather-api.example.test' });
  assert.equal(readBootstrap(await plugin.render()).config.qweatherHost, 'https://weather-api.example.test');
});

test('legacy custom scripts receive one mounted card, including after navigation', async () => {
  const plugin = loadPlugin({ enable: true, clock_js: '/custom-clock.js', exclude: ['draft'] });
  const html = await plugin.render(HTML.replace('<main>Content</main>', '<aside id="aside-content"><div class="sticky_layout"></div></aside>'));
  const dom = new JSDOM(html, { url: 'https://example.test/posts/visible.html', runScripts: 'outside-only' });
  try {
    const inline = dom.window.document.querySelector('script[data-pjax]:not([src])').textContent;
    dom.window.eval(inline);
    dom.window.eval(inline);
    assert.equal(dom.window.document.querySelectorAll('#hexo_electric_clock').length, 1);
    dom.window.history.pushState({}, '', '/posts/draft-note.html');
    dom.window.eval(inline);
    assert.equal(dom.window.document.querySelectorAll('#hexo_electric_clock').length, 0);
    dom.window.history.pushState({}, '', '/posts/visible.html');
    dom.window.eval(inline);
    assert.equal(dom.window.document.querySelectorAll('#hexo_electric_clock').length, 1);
    dom.window.document.querySelector('aside').classList.add('hide-aside');
    dom.window.document.getElementById('hexo_electric_clock').closest('.card-clock').remove();
    dom.window.eval(inline);
    assert.equal(dom.window.document.querySelectorAll('#hexo_electric_clock').length, 0);
  } finally {
    dom.window.close();
  }
});
