// Syntax-checks every backend source file, including ones no test imports.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
// tests/ is loaded by vitest (and uses ESM import syntax), so it is skipped here.
const skip = new Set(['node_modules', 'coverage', '.git', 'tests']);

const collect = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  if (skip.has(entry.name)) return [];
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) return collect(full);
  return entry.name.endsWith('.js') ? [full] : [];
});

const files = collect(root);
for (const file of files) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
}
console.log(`syntax ok: ${files.length} files`);
