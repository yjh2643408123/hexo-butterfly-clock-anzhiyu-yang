'use strict';

const fs = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');
const PREFIX = 'electric-clock-integration-';
const PLUGINS = ['hexo-server', 'hexo-generator-index', 'hexo-generator-archive',
  'hexo-generator-category', 'hexo-generator-tag', 'hexo-renderer-pug',
  'hexo-renderer-stylus', 'hexo-renderer-marked'];

function checkedDirectory(directory) {
  const resolved = path.resolve(directory);
  const relative = path.relative(path.resolve(os.tmpdir()), resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative) ||
      path.dirname(relative) !== '.' || !path.basename(resolved).startsWith(PREFIX)) {
    throw new Error('Refusing to remove a directory outside the fixture temp root: ' + resolved);
  }
  return resolved;
}

async function cleanupDirectory(directory) {
  const root = checkedDirectory(directory);
  // Remove the links themselves before removing the fixture. Never recurse into
  // dependencies or real theme directories through a Windows junction.
  for (const name of ['node_modules', 'themes/anzhiyu', 'themes/solitude']) {
    const link = path.join(root, name);
    let stat;
    try { stat = await fs.lstat(link); } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    if (!stat.isSymbolicLink()) throw new Error('Expected a fixture link: ' + link);
    await fs.unlink(link);
  }
  await fs.rm(root, { recursive: true, force: true });
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function createFixture(options = {}) {
  const hexoName = options.hexo || 'hexo8';
  const themeName = options.theme || 'solitude';
  if (!['hexo7', 'hexo8'].includes(hexoName)) throw new Error('Unsupported fixture Hexo alias');
  if (!['anzhiyu', 'solitude'].includes(themeName)) throw new Error('Unsupported fixture theme');
  const root = options.root || '/';
  if (!/^\/(?:[a-z0-9-]+\/)*$/.test(root)) throw new Error('Invalid fixture URL root');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), PREFIX));
  options.onCreated?.({ directory });
  let hexo;
  let server;
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    try {
      if (server) {
        server.closeAllConnections?.();
        await new Promise(resolve => server.close(resolve));
      }
      if (hexo) {
        await hexo.unwatch();
        await hexo.exit();
      }
    } finally {
      await cleanupDirectory(directory);
    }
  };
  try {
    const port = options.port || await freePort();
    const themePackage = 'hexo-theme-' + themeName;
    const themeDirectory = path.dirname(require.resolve(themePackage + '/package.json'));
    const themeVersion = require(themePackage + '/package.json').version;
    await fs.mkdir(path.join(directory, 'source/_posts'), { recursive: true });
    await fs.mkdir(path.join(directory, 'source/about'), { recursive: true });
    await fs.mkdir(path.join(directory, 'themes'), { recursive: true });
    const linkType = process.platform === 'win32' ? 'junction' : 'dir';
    await fs.symlink(path.join(REPO, 'node_modules'), path.join(directory, 'node_modules'), linkType);
    await fs.symlink(themeDirectory, path.join(directory, 'themes', themeName), linkType);
    await fs.writeFile(path.join(directory, 'package.json'), JSON.stringify({
      name: 'electric-clock-fixture', private: true, hexo: { version: '8.0.0' },
      dependencies: Object.fromEntries(PLUGINS.map(name => [name, '*']))
    }, null, 2));
    const config = {
      title: 'Electric Clock Compatibility Fixture', author: 'Fixture',
      url: 'http://127.0.0.1:' + port + root, root, language: 'zh-CN',
      timezone: 'UTC', theme: themeName, permalink: 'posts/:title.html',
      date_format: 'YYYY-MM-DD', time_format: 'HH:mm:ss',
      highlight: { enable: false }, prismjs: { enable: false },
      server: { ip: '127.0.0.1', port, log: false },
      electric_clock: { enable: true, qweather_key: '', gaud_map_key: '' },
      theme_config: themeName === 'anzhiyu' ? {
        pjax: { enable: true }, wordcount: { enable: false },
        comments: { use: [] }, lazyload: { enable: false },
        aside: { enable: true, mobile: true }
      } : {
        // Solitude's optional nib prefixer cannot evaluate its current
        // opacity: var(...) rules. Disable that theme option in this fixture;
        // the browser still receives the complete unprefixed theme stylesheet.
        css_prefix: false,
        lazyload: { enable: false }, comment: { use: [] },
        aside: {
          home: { noSticky: 'about', Sticky: 'allInfo' },
          post: { noSticky: 'about', Sticky: 'newestPost' },
          page: { noSticky: 'about', Sticky: 'newestPost,allInfo' }
        }
      }
    };
    await fs.writeFile(path.join(directory, '_config.yml'), JSON.stringify(config, null, 2));
    const postFile = path.join(directory, 'source/_posts/clock-check.md');
    await fs.writeFile(postFile, '---\ntitle: Clock Check\ndate: 2026-01-02 12:00:00\naside: true\ntags: [Clock]\ncategories: [Fixture]\n---\n\nClock fixture article.\n');
    await fs.writeFile(path.join(directory, 'source/about/index.md'),
      '---\ntitle: About Fixture\ndate: 2026-01-02 12:00:00\naside: false\n---\n\nThis page intentionally has no sidebar.\n');
    const Hexo = require(hexoName);
    hexo = new Hexo(directory, { silent: options.silent === true });
    await hexo.init();
    await hexo.loadPlugin(path.join(REPO, 'index.js'));
    // Exercise the same server/watch path as `hexo s`; never call generate/deploy.
    server = await hexo.call('server', {});
    const baseUrl = 'http://127.0.0.1:' + port + root;
    return {
      directory, postFile, hexo: hexo.version, theme: themeName, themeVersion,
      root, baseUrl, postUrl: baseUrl + 'posts/clock-check.html',
      aboutUrl: baseUrl + 'about/', close
    };
  } catch (error) {
    await close();
    throw error;
  }
}

module.exports = { createFixture, cleanupDirectory, checkedDirectory };

if (require.main === module) {
  const args = process.argv.slice(2);
  const value = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
  const send = (type, data) => {
    if (process.send) process.send({ type, ...data });
    else console.log('ELECTRIC_CLOCK_FIXTURE_' + type.toUpperCase() + ' ' + JSON.stringify(data));
  };
  let fixture;
  let startup;
  let stopping;
  const stop = () => {
    // A shutdown received during startup still waits for the owned Hexo
    // instance, so its watchers and junctions can be closed normally.
    if (!stopping) stopping = Promise.resolve(startup).then(result => result?.close(), () => {}).then(() => process.exit(process.exitCode || 0), error => {
      console.error(error);
      process.exit(1);
    });
    return stopping;
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  process.on('message', message => { if (message?.type === 'shutdown') stop(); });
  process.on('disconnect', stop);
  // Portable graceful shutdown for a long-running `exec` session on Windows,
  // where a Ctrl+C may otherwise terminate the process before finally runs.
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    input += chunk;
    const lines = input.split(/\r?\n/);
    input = lines.pop();
    for (const line of lines) if (line === 'shutdown') stop();
  });
  startup = createFixture({
    hexo: value('--hexo'), theme: value('--theme'), root: value('--root'),
    port: Number(value('--port')) || undefined,
    onCreated: data => send('created', data)
  });
  startup.then(async result => {
    fixture = result;
    if (stopping) return;
    const { close, ...description } = fixture;
    send('ready', description);
    if (!args.includes('--keep') && !process.send) await stop();
  }).catch(error => {
    console.error(error);
    process.exitCode = 1;
    if (process.connected) process.disconnect();
  });
}
