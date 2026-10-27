// Bundles a TypeScript script (default: the balance simulation) with esbuild, which ships with Vite, and runs it in Node.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { basename, resolve } from 'node:path';

const entry = process.argv[2] ?? 'scripts/balanceSim.ts';
const out = resolve('.sim-build', basename(entry).replace(/\.ts$/, '.mjs'));
await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'warning' });
await import(pathToFileURL(out).href);
