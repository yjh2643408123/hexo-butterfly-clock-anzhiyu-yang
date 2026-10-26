# Changelog

## 2.1.0

- Support Hexo 7 and 8 with generator-managed local assets and idempotent HTML injection.
- Auto-detect Butterfly, Anzhiyu and Solitude sidebars; support Solitude navigation events.
- Keep a single clock and timer across navigation, reuse weather requests and cache results.
- Keep local time available when weather is unconfigured, unavailable or times out.
- Remove bundled API keys, default personal coordinates and external font/CDN dependencies.
- Preserve existing configuration options and add dedicated QWeather host configuration.
- Add browser-runtime regression tests and isolated Hexo server compatibility tests.
