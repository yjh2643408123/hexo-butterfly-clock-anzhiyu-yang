'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const repo = path.resolve(__dirname, '..');
const prefix = 'electric-clock-package-';

async function main() {
  assert.ok(process.env.npm_execpath, 'Run this check with npm run test:package');
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    const { stdout } = await run(process.execPath, [process.env.npm_execpath, 'pack', '--json', '--ignore-scripts',
      '--pack-destination', temporary, '--logs-dir', path.join(temporary, 'logs')], { cwd: repo });
    const metadata = JSON.parse(stdout)[0];
    const archive = zlib.gunzipSync(await fs.readFile(path.join(temporary, metadata.filename)));
    let files = 0;
    for (let offset = 0; offset + 512 <= archive.length;) {
      const header = archive.subarray(offset, offset + 512);
      if (header.every(byte => byte === 0)) break;
      const name = header.subarray(0, 100).toString().replace(/\0.*$/, '');
      const size = parseInt(header.subarray(124, 136).toString().replace(/\0.*$/, '').trim(), 8) || 0;
      const contents = archive.subarray(offset + 512, offset + 512 + size);
      assert.match(name, /^package\/(?:lib\/[\w./-]+|index\.js|package\.json|README\.md|LICENSE)$/,
        'Unexpected package file: ' + name);
      assert.doesNotMatch(name, /(?:node_modules|\.env|\.npmrc|test\/|\.log$|\.tgz$)/i);
      if (/\.(?:js|css|pug|json|md)$/.test(name)) {
        const text = contents.toString('utf8');
        assert.doesNotMatch(text, /\b[a-f\d]{32}\b/i, 'Possible embedded credential in ' + name);
        assert.doesNotMatch(text, /[A-Z]:[\\/](?:Users|My-blog)[\\/]/i, 'Personal filesystem path in ' + name);
        if (/\.css$/.test(name)) assert.doesNotMatch(text, /url\(\s*["']?https?:/i, 'External font/CDN in ' + name);
      }
      files += 1;
      offset += 512 + Math.ceil(size / 512) * 512;
    }
    assert.equal(files, metadata.entryCount);
    console.log('Package ' + metadata.version + ': ' + files + ' files checked; no embedded keys, private paths, remote fonts or test artifacts.');
  } finally {
    const absolute = path.resolve(temporary);
    assert.equal(path.dirname(absolute), path.resolve(os.tmpdir()));
    assert.ok(path.basename(absolute).startsWith(prefix));
    await fs.rm(absolute, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
