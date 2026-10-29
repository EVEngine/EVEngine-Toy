#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { doctor, exportPackage, exportProbe } from '../lib/package.mjs';
import { preview } from '../lib/official.mjs';
import { buildGame, parseBuildOptions } from '../lib/build.mjs';

const [command, input, output, ...extra] = process.argv.slice(2);
function emit(value) { console.log(JSON.stringify(value, null, 2)); }
function toyHelp() {
  const result = spawnSync('toy', ['--help-json'], { encoding: 'utf8', shell: false });
  if (result.error || result.status !== 0) throw new Error('Official toy CLI is unavailable; install it from bilibili/toy instructions');
  return JSON.parse(result.stdout);
}
try {
  if (command === 'build') {
    emit(await buildGame(parseBuildOptions(process.argv.slice(3))));
  } else if (command === 'doctor' && input && !output) {
    const report = await doctor(path.resolve(input)); emit(report); process.exitCode = report.ok ? 0 : 1;
  } else if (command === 'pack' && input && output && !extra.length) {
    emit(await exportPackage(path.resolve(input), path.resolve(output)));
  } else if (command === 'probe' && input && !output) {
    emit(await exportProbe(path.resolve(input)));
  } else if (command === 'preview' && input) {
    emit(await preview(path.resolve(input), [output, ...extra].filter(value => value !== undefined)));
  } else if (command === 'toy-help' && !input) {
    emit(toyHelp());
  } else if (command === 'serve' && input && !extra.length) {
    const directory = path.resolve(input);
    const port = Number(output ?? 8090);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Port must be 1024..65535');
    const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.wasm':'application/wasm' };
    const server = createServer(async (request, response) => {
      try {
        // Deliberately test nested deployment. No CORS and no isolation headers:
        // a local server must not hide the Toy hosting prerequisite.
        const url = new URL(request.url, 'http://localhost');
        if (!url.pathname.startsWith('/toy/local/')) { response.writeHead(404).end(); return; }
        const relative = decodeURIComponent(url.pathname.slice('/toy/local/'.length)) || 'index.html';
        const file = path.resolve(directory, relative);
        const rel = path.relative(directory, file);
        if (rel.startsWith('..') || path.isAbsolute(rel)) { response.writeHead(403).end(); return; }
        let walk = directory;
        if ((await lstat(walk)).isSymbolicLink()) throw new Error('Symlink root');
        for (const segment of rel.split(path.sep)) {
          walk = path.join(walk, segment);
          if ((await lstat(walk)).isSymbolicLink()) throw new Error('Symlink resource');
        }
        const data = await readFile(file);
        response.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream', 'cache-control':'no-store' });
        response.end(data);
      } catch { response.writeHead(404).end(); }
    });
    server.listen(port, '127.0.0.1', () => emit({ url: `http://127.0.0.1:${port}/toy/local/index.html`, isolationHeaders: false }));
    server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  } else {
    console.log('eve-toy probe <new-dir> | doctor <package-dir> | pack <engine-output-dir> <new-dir> | serve <package-dir> [port] | preview <package-dir> [metadata flags] | toy-help');
    if (command && command !== '--help') process.exitCode = 2;
  }
} catch (error) { emit({ ok: false, error: String(error.message ?? error) }); process.exitCode = 1; }
