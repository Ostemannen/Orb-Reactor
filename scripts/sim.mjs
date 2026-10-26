// Bundles the TypeScript balance simulation with esbuild (shipped with Vite) and runs it in Node.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const out = resolve('.sim-build/balanceSim.mjs');
await build({ entryPoints: ['scripts/balanceSim.ts'], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'warning' });
await import(pathToFileURL(out).href);
