import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outFile = resolve(__dirname, 'feed-coach.user.js');

const header = `// ==UserScript==
// @name         Feed Coach
// @namespace    https://example.com/feed-coach
// @version      0.1.0
// @description  AI-powered YouTube feed assistant
// @author       Feed Coach
// @match        https://www.youtube.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==
`;

async function bundle() {
  const result = await build({
    entryPoints: [resolve(__dirname, 'src/bootstrap.js')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2022'],
    write: false,
    minify: false,
    sourcemap: false,
    logLevel: 'info'
  });

  const code = result.outputFiles[0].text;
  const output = header + code;
  writeFileSync(outFile, output, 'utf8');
  console.log(`Bundled ${outFile} (${output.length} bytes)`);
}

bundle().catch((error) => {
  console.error('Build failed', error);
  process.exit(1);
});
