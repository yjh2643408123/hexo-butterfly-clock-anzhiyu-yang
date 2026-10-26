/* A single clock runtime for full page loads, PJAX and Solitude navigation. */
(function () {
  'use strict';

  var existing = window.__hexoElectricClock;
  if (existing && typeof existing.mount === 'function') {
    existing.mount();
    return;
  }
  if (existing && existing.timer != null) clearInterval(existing.timer);

  var CACHE_TTL = 10 * 60 * 1000;
  var REQUEST_TIMEOUT = 8000;
  var DEFAULT_HTML = '<div class="card-widget card-clock"><div class="card-glass"><div class="card-background"><div class="card-content"><div id="hexo_electric_clock"></div></div></div></div></div>';
  var state = window.__hexoElectricClock = {
    runtimeVersion: 'managed-v1',
    card: null,
    nodes: null,
    timer: null,
    mountVersion: 0,
    configKey: '',
    weather: null,
    weatherFetchedAt: 0,
    pending: null,
    mount: mount,
    stop: stop
  };

  function legacy(name) {
    return window[name] === undefined ? '' : window[name];
  }

  function readConfig() {
    var source = window.__hexoElectricClockConfig;
    var modern = source && typeof source === 'object';
    source = modern ? source : {};
    var config = {
      modern: modern,
      root: source.root || '/',
      enablePage: source.enablePage !== undefined ? source.enablePage : legacy('epage') || 'all',
      exclude: source.exclude !== undefined ? source.exclude : legacy('elist'),
      layout: source.layout || { type: 'auto' },
      html: source.html || DEFAULT_HTML,
      weatherKey: source.weatherKey !== undefined ? source.weatherKey : legacy('qweather_key'),
      mapKey: source.mapKey !== undefined ? source.mapKey : legacy('gaud_map_key'),
      rectangle: source.rectangle !== undefined ? source.rectangle : legacy('clock_rectangle'),
      fixed: source.fixed !== undefined ? source.fixed : legacy('clock_default_rectangle_enable'),
      qweatherHost: source.qweatherHost || 'https://devapi.qweather.com',
      weatherPath: source.weatherPath || '/v7/weather/now'
    };
    config.fixed = config.fixed === true || config.fixed === 'true';
    config.weatherKey = String(config.weatherKey || '').trim();
    config.mapKey = String(config.mapKey || '').trim();
    config.qweatherHost = String(config.qweatherHost).trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(config.qweatherHost)) config.qweatherHost = 'https://' + config.qweatherHost;
    return config;
  }

  function normalizePath(value) {
    var path = String(value || '/').split(/[?#]/)[0];
    try { path = decodeURIComponent(path); } catch (error) { /* Keep malformed encoded paths usable. */ }
    if (path.charAt(0) !== '/') path = '/' + path;
    return path.replace(/\/{2,}/g, '/');
  }

  function paths(value) {
    return (Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [])
      .filter(function (item) { return typeof item === 'string' && item.trim(); })
      .map(function (item) { return item.trim(); });
  }

  function relativePath(config) {
    var path = normalizePath(location.pathname);
    var root = normalizePath(config.root).replace(/\/$/, '');
    if (root && (path === root || path.indexOf(root + '/') === 0)) path = path.slice(root.length) || '/';
    return path;
  }

  function matches(path, pattern) {
    pattern = normalizePath(pattern);
    if (pattern === '/') return path === '/';
    var prefix = pattern.replace(/\/$/, '');
    return path === prefix || path.indexOf(prefix + '/') === 0;
  }

  function allowed(config) {
    var path = relativePath(config);
    var fullPath = normalizePath(location.pathname);
    // A scalar enable_page historically selects exactly one path; arrays add section matching.
    var enabled = config.enablePage === 'all' || (Array.isArray(config.enablePage) ?
      paths(config.enablePage).some(function (item) { return matches(path, item) || matches(fullPath, item); }) :
      typeof config.enablePage === 'string' &&
        (normalizePath(config.enablePage) === path || normalizePath(config.enablePage) === fullPath));
    return enabled && !paths(config.exclude).some(function (item) {
      // Preserve legacy substring exclusions, including '/' excluding every page.
      return path.indexOf(item) !== -1 || fullPath.indexOf(item) !== -1;
    });
  }

  function container(config) {
    var layout = config.layout;
    var target = null;
    try {
      if (!layout.type || layout.type === 'auto') target = document.querySelector('#aside-content .sticky_layout') || document.querySelector('#aside-content');
      else if (layout.type === 'id') target = document.getElementById(layout.name);
      else if (layout.type === 'class') target = document.getElementsByClassName(layout.name)[Number(layout.index) || 0] || null;
      else if (layout.type === 'selector') target = document.querySelectorAll(layout.name)[Number(layout.index) || 0] || null;
    } catch (error) { /* Invalid selectors must not break the rest of the page. */ }
    return target && !target.closest('.hide-aside') ? target : null;
  }

  function cardRoot(card) {
    return card.closest('.card-clock') || card;
  }

  function removeCards(keep) {
    document.querySelectorAll('#hexo_electric_clock').forEach(function (card) {
      if (card !== keep) cardRoot(card).remove();
    });
    document.querySelectorAll('[data-hexo-electric-clock="card"]').forEach(function (root) {
      if (!keep || !root.contains(keep)) root.remove();
    });
  }

  function ensureCard(config) {
    var parent = container(config);
    var card = document.getElementById('hexo_electric_clock');
    if (card && card.closest('.hide-aside')) return null;
    // Old injectors already place the card, sometimes outside theme sidebars.
    if (!parent && !config.modern && card) {
      removeCards(card);
      cardRoot(card).setAttribute('data-hexo-electric-clock', 'card');
      return card;
    }
    if (!parent) return null;
    if (card && parent.contains(card)) {
      removeCards(card);
      cardRoot(card).setAttribute('data-hexo-electric-clock', 'card');
      return card;
    }
    removeCards();
    var wrapper = document.createElement('div');
    wrapper.innerHTML = config.html;
    card = wrapper.querySelector('#hexo_electric_clock');
    if (!card) return null;
    var root = card.closest('.card-clock') || wrapper.firstElementChild;
    if (!root || !root.contains(card)) return null;
    root.classList.add('card-clock');
    root.setAttribute('data-hexo-electric-clock', 'card');
    parent.insertBefore(root, parent.firstChild);
    return card;
  }

  function element(tag, className, parent, id) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (id) node.id = id;
    if (parent) parent.appendChild(node);
    return node;
  }

  function buildClock(card) {
    card.textContent = '';
    var first = element('div', 'clock-row', card);
    var date = element('span', 'card-clock-clockdate', first, 'card-clock-clockdate');
    var weather = element('span', 'card-clock-weather', first);
    var weatherIcon = element('i', '', weather);
    var weatherText = element('span', '', weather);
    var humidity = element('span', 'card-clock-humidity', first);
    var second = element('div', 'clock-row', card);
    var time = element('span', 'card-clock-time', second, 'card-clock-time');
    var third = element('div', 'clock-row', card);
    var wind = element('span', 'card-clock-windDir', third);
    element('i', 'qi-gale', wind);
    var windText = element('span', '', wind);
    var city = element('span', 'card-clock-location', third);
    var period = element('span', 'card-clock-dackorlight', third, 'card-clock-dackorlight');
    return {
      date: date, time: time, period: period, weatherIcon: weatherIcon,
      weatherText: weatherText, humidity: humidity, windText: windText, location: city
    };
  }

  function stop() {
    if (state.timer !== null) clearInterval(state.timer);
    state.timer = null;
    state.card = null;
    state.nodes = null;
    state.mountVersion += 1;
  }

  function tick() {
    if (!state.card || !state.card.isConnected) { stop(); return; }
    var now = new Date();
    var pad = function (number) { return String(number).padStart(2, '0'); };
    state.nodes.date.textContent = now.getFullYear() + '-' + pad(now.getMonth() + 1) +
      '-' + pad(now.getDate()) + ' ' + ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][now.getDay()];
    state.nodes.time.textContent = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
    state.nodes.period.textContent = now.getHours() >= 12 ? ' P M' : ' A M';
  }

  function weatherColor(icon) {
    var value = Number(icon);
    if (value === 100) return '#fdcc45';
    if (value === 101) return '#fe6976';
    if (value === 102 || value === 103) return '#fe7f5b';
    if (value === 104 || (value >= 150 && value <= 154) || (value >= 800 && value <= 807)) return '#2152d1';
    if (value === 302 || value === 303 || value === 304) return '#fdcc46';
    if (value >= 300 && value <= 399) return '#49b1f5';
    if (value >= 400 && value <= 499) return '#a3c2dc';
    if (value >= 500 && value <= 515) return '#97acba';
    if (value === 901) return '#179fff';
    return value === 900 || value === 999 ? 'red' : '#000';
  }

  function showWeather(weather) {
    state.nodes.weatherIcon.className = 'qi-' + weather.icon + '-fill';
    state.nodes.weatherIcon.style.color = weatherColor(weather.icon);
    state.nodes.weatherText.textContent = ' ' + weather.text + ' ' + weather.temp + ' ℃';
    state.nodes.humidity.textContent = '💧 ' + weather.humidity + '%';
    state.nodes.windText.textContent = ' ' + weather.windDir;
    state.nodes.location.textContent = weather.city;
  }

  function showPlaceholder(status) {
    state.nodes.weatherIcon.className = '';
    state.nodes.weatherText.textContent = status;
    state.nodes.humidity.textContent = '💧 --%';
    state.nodes.windText.textContent = ' --';
    state.nodes.location.textContent = status === '天气加载中' ? '定位中' : '--';
  }

  function fetchJson(url) {
    return new Promise(function (resolve, reject) {
      var controller = typeof AbortController === 'undefined' ? null : new AbortController();
      var timeout = setTimeout(function () {
        if (controller) controller.abort();
        reject(new Error('Weather request timed out'));
      }, REQUEST_TIMEOUT);
      Promise.resolve().then(function () {
        return fetch(url, controller ? { signal: controller.signal } : {});
      }).then(function (response) {
        if (!response.ok) throw new Error('Weather request failed');
        return response.json();
      }).then(function (data) {
        clearTimeout(timeout);
        resolve(data);
      }, function (error) {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  function coordinates(value) {
    if (typeof value !== 'string') return '';
    var point = value.split(';')[0].trim();
    var parts = point.split(',');
    if (parts.length !== 2 || parts.some(function (part) { return !part.trim(); })) return '';
    var longitude = Number(parts[0]);
    var latitude = Number(parts[1]);
    return Number.isFinite(longitude) && Number.isFinite(latitude) &&
      Math.abs(longitude) <= 180 && Math.abs(latitude) <= 90 ? point : '';
  }

  function cityName(city, province) {
    return typeof city === 'string' && city ? city :
      typeof province === 'string' && province ? province : '';
  }

  async function reverseCity(config, point) {
    if (!config.mapKey) return '默认位置';
    try {
      var data = await fetchJson('https://restapi.amap.com/v3/geocode/regeo?key=' +
        encodeURIComponent(config.mapKey) + '&location=' + encodeURIComponent(point));
      if (String(data.status) === '1' && data.regeocode && data.regeocode.addressComponent) {
        var address = data.regeocode.addressComponent;
        return cityName(address.city, address.province) || '未知城市';
      }
    } catch (error) { /* A missing city must not prevent coordinate-based weather. */ }
    return '未知城市';
  }

  async function locate(config) {
    if (!config.fixed && config.mapKey) {
      try {
        var data = await fetchJson('https://restapi.amap.com/v3/ip?key=' + encodeURIComponent(config.mapKey));
        var point = String(data.status) === '1' ? coordinates(data.rectangle) : '';
        if (point) return { location: point, city: cityName(data.city, data.province) || await reverseCity(config, point) };
      } catch (error) { /* Continue with the configured fallback coordinates. */ }
    }
    var fallback = coordinates(config.rectangle);
    if (!fallback) throw new Error('Location unavailable');
    return { location: fallback, city: await reverseCity(config, fallback) };
  }

  async function loadWeather(config) {
    var found = await locate(config);
    var url = new URL(config.weatherPath, config.qweatherHost + '/');
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Weather host unavailable');
    url.searchParams.set('location', found.location);
    url.searchParams.set('key', config.weatherKey);
    var data = await fetchJson(url.toString());
    if (!data || (data.code && String(data.code) !== '200') || !data.now ||
        data.now.temp === undefined || data.now.temp === null || !Number.isFinite(Number(data.now.temp))) {
      throw new Error('Weather data unavailable');
    }
    var now = data.now;
    return {
      icon: /^\d{3,4}$/.test(String(now.icon)) ? String(now.icon) : '999',
      text: typeof now.text === 'string' && now.text ? now.text : '天气未知',
      temp: String(now.temp),
      humidity: now.humidity !== undefined && Number.isFinite(Number(now.humidity)) ? String(now.humidity) : '--',
      windDir: typeof now.windDir === 'string' && now.windDir ? now.windDir : '--',
      city: found.city
    };
  }

  function requestWeather(config, configKey) {
    if (state.pending && state.pending.configKey === configKey) return state.pending.promise;
    var request = { configKey: configKey, promise: null };
    request.promise = loadWeather(config).then(function (weather) {
      if (state.configKey === configKey) {
        state.weather = weather;
        state.weatherFetchedAt = Date.now();
      }
      return weather;
    }).finally(function () {
      if (state.pending === request) state.pending = null;
    });
    state.pending = request;
    return request.promise;
  }

  function mount() {
    var config = readConfig();
    if (!allowed(config)) { stop(); removeCards(); return; }
    var card = ensureCard(config);
    if (!card) { stop(); removeCards(); return; }
    var configKey = JSON.stringify([config.weatherKey, config.mapKey, config.rectangle, config.fixed, config.qweatherHost, config.weatherPath]);
    var sameConfig = state.configKey === configKey;
    if (!sameConfig) {
      state.configKey = configKey;
      state.weather = null;
      state.weatherFetchedAt = 0;
    }
    if (sameConfig && state.card === card && state.timer !== null) return;
    stop();
    state.card = card;
    state.nodes = buildClock(card);
    var version = state.mountVersion;
    tick();
    state.timer = setInterval(tick, 1000);
    if (!config.weatherKey) { showPlaceholder('天气未配置'); return; }
    if (state.weather && Date.now() - state.weatherFetchedAt < CACHE_TTL) { showWeather(state.weather); return; }
    showPlaceholder('天气加载中');
    requestWeather(config, configKey).then(function (weather) {
      if (state.card === card && card.isConnected && state.mountVersion === version) showWeather(weather);
    }, function () {
      if (state.card === card && card.isConnected && state.mountVersion === version) showPlaceholder('天气不可用');
    });
  }

  function afterNavigate() {
    mount();
    // Some themes emit their completion event just before synchronously adding the sidebar.
    Promise.resolve().then(mount);
  }

  ['pjax:send', 'solitude:beforeNavigate'].forEach(function (event) { document.addEventListener(event, stop); });
  ['pjax:complete', 'solitude:ready', 'solitude:afterNavigate'].forEach(function (event) { document.addEventListener(event, afterNavigate); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', afterNavigate, { once: true });
  mount();
}());
