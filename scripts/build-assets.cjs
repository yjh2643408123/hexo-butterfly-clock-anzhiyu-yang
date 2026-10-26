'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const terser = require('terser');
const postcss = require('postcss');
const cssnano = require('cssnano');

async function main() {
  const lib = path.resolve(__dirname, '../lib');
  const js = await fs.readFile(path.join(lib, 'clock.js'), 'utf8');
  const css = await fs.readFile(path.join(lib, 'clock.css'), 'utf8');
  const compactJs = await terser.minify(js, { format: { comments: /^!/ } });
  const compactCss = await postcss([cssnano({ preset: 'default' })]).process(css, { from: undefined });
  await fs.writeFile(path.join(lib, 'clock.min.js'), compactJs.code + '\n');
  await fs.writeFile(path.join(lib, 'clock.min.css'), compactCss.css + '\n');
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
