// Minimal Node typings for the build scripts (avoids a @types/node dependency).
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function writeFileSync(path: string, data: string): void;
}
