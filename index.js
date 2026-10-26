'use strict';

const fs = require('fs');
const path = require('path');
const pug = require('pug');

const ASSET_ROOT = 'electric-clock/';
const HEAD_MARKER = '<!-- electric-clock:head -->';
const BODY_MARKER = '<!-- electric-clock:body -->';

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function settings() {
  const theme = object(hexo.theme && hexo.theme.config && hexo.theme.config.electric_clock);
  const site = object(hexo.config.electric_clock);
  const config = Object.assign({}, theme, site);
  config.layout = Object.assign({}, object(theme.layout), object(site.layout));
  return config;
}

function rootPath() {
  const root = String(hexo.config.root || '/').replace(/^\/+|\/+$/g, '');
  return root ? '/' + root + '/' : '/';
}

function urlFor(value) {
  const url = String(value);
  if (/^(?:https?:)?\/\//i.test(url) || /^data:/i.test(url)) return url;
  const helper = hexo.extend.helper && hexo.extend.helper.get('url_for');
  if (helper) return helper.call(hexo, url);
  const root = rootPath();
  return url.startsWith(root) ? url : root + url.replace(/^\/+/, '');
}

function escapeAttribute(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function scriptJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function list(value) {
  return (Array.isArray(value) ? value : value ? [value] : []).filter(item => typeof item === 'string' && item.length);
}

function browserSettings(config) {
  const loading = urlFor(config.loading || ASSET_ROOT + 'loading.gif');
  let host = String(config.qweather_host || 'https://devapi.qweather.com').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(host)) host = 'https://' + host;
  const index = Number(config.layout.index);
  return {
    root: rootPath(),
    enablePage: config.enable_page === undefined ? 'all' : config.enable_page,
    exclude: list(config.exclude),
    layout: {
      type: config.layout.type || (config.layout.name ? 'id' : 'auto'),
      name: config.layout.name || '',
      index: Number.isInteger(index) && index >= 0 ? index : 0
    },
    html: config.temple_html || pug.renderFile(path.join(__dirname, 'lib/html.pug'), { loading }),
    loading,
    weatherKey: config.qweather_key || '',
    mapKey: config.gaud_map_key || '',
    rectangle: config.rectangle === undefined ? '' : String(config.rectangle),
    fixed: config.default_rectangle === true || config.default_rectangle === 'true',
    qweatherHost: host,
    weatherPath: config.qweather_path || '/v7/weather/now'
  };
}

// Custom scripts from 2.0 expect the original injector to create their card.
// The bundled runtime manages its own card; this fallback is for overrides only.
function mountLegacyCard(c) {
  function values(value) {
    return (Array.isArray(value) ? value : value ? [value] : []).filter(function (item) {
      return typeof item === 'string' && item.length;
    });
  }
  var pathname = location.pathname;
  try { pathname = decodeURIComponent(pathname); } catch (error) { /* Keep the original path. */ }
  var root = c.root.replace(/\/$/, '');
  var relative = root && (pathname === root || pathname.indexOf(root + '/') === 0) ? pathname.slice(root.length) || '/' : pathname;
  var enabled = c.enablePage === 'all' || (Array.isArray(c.enablePage) ? c.enablePage.some(function (value) {
    var prefix = value.replace(/\/$/, '');
    return [pathname, relative].some(function (current) {
      return value === '/' ? current === '/' : current === prefix || current.indexOf(prefix + '/') === 0;
    });
  }) : c.enablePage === pathname || c.enablePage === relative);
  var excluded = values(c.exclude).some(function (value) {
    return pathname.includes(value) || relative.includes(value);
  });
  var card = document.getElementById('hexo_electric_clock');
  if (!enabled || excluded) {
    if (card) (card.closest('.card-clock') || card).remove();
    return;
  }
  var parent;
  try {
    if (c.layout.type === 'auto') parent = document.querySelector('#aside-content .sticky_layout') || document.querySelector('#aside-content');
    else if (c.layout.type === 'class') parent = document.getElementsByClassName(c.layout.name)[c.layout.index];
    else if (c.layout.type === 'selector') parent = document.querySelectorAll(c.layout.name)[c.layout.index];
    else parent = document.getElementById(c.layout.name);
  } catch (error) { return; }
  if (!parent || parent.closest('.hide-aside')) return;
  if (card && parent.contains(card)) return;
  if (card) (card.closest('.card-clock') || card).remove();
  parent.insertAdjacentHTML('afterbegin', c.html);
}

// These public APIs are shared by Hexo 7 and 8. Resources stay in Hexo's route
// table, including during hexo server and incremental regeneration.
hexo.extend.generator.register('electric_clock_assets', function () {
  if (!settings().enable) return [];
  const assets = ['clock.js', 'clock.min.js', 'clock.css', 'clock.min.css', 'loading.gif',
    'fonts/qweather-icons.ttf', 'fonts/qweather-icons.woff', 'fonts/qweather-icons.woff2'];
  return assets.map(file => ({
    path: ASSET_ROOT + file,
    data: () => fs.createReadStream(path.join(__dirname, 'lib', file))
  }));
});

const initial = settings();
const priority = Number(initial.priority);
hexo.extend.filter.register('after_render:html', function (html) {
  const config = settings();
  if (!config.enable || typeof html !== 'string') return html;
  const data = browserSettings(config);
  if (!html.includes(HEAD_MARKER)) {
    const css = escapeAttribute(urlFor(config.clock_css || ASSET_ROOT + 'clock.min.css'));
    html = html.replace(/<\/head\s*>/i, HEAD_MARKER + '<link rel="stylesheet" href="' + css + '"></head>');
  }
  if (!html.includes(BODY_MARKER)) {
    const js = escapeAttribute(urlFor(config.clock_js || ASSET_ROOT + 'clock.js'));
    // Preserve the original globals for callers who provide their own clock_js.
    const bootstrap = '(function(){var c=window.__hexoElectricClockConfig=' + scriptJson(data) + ';' +
      'window.qweather_key=c.weatherKey;window.gaud_map_key=c.mapKey;' +
      'window.clock_rectangle=c.rectangle;window.clock_default_rectangle_enable=String(c.fixed);' +
      'window.epage=c.enablePage;window.elist=c.exclude;' +
      (config.clock_js ? '(' + mountLegacyCard.toString() + ')(c);' : '') +
      'if(window.__hexoElectricClock)window.__hexoElectricClock.mount();}());';
    html = html.replace(/<\/body\s*>/i, BODY_MARKER + '<script data-pjax>' + bootstrap + '</script>' +
      '<script data-pjax src="' + js + '"></script></body>');
  }
  return html;
}, Number.isFinite(priority) ? priority : 10);
