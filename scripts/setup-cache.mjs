import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, rename, writeFile, access, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = process.env.GOCTRO_SETUP_RUNTIME_DIR || path.join(root, '.local/setup');
const config = process.env.GOCTRO_SETUP_CONFIG_DIR || path.join(root, 'backend');
async function bytes(filename) { try { return await readFile(filename); } catch (e) { if (e.code === 'ENOENT') return Buffer.from('MISSING'); throw e; } }
async function tree(directory) {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = [];
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const name = path.join(directory, entry.name);
      if (entry.isDirectory()) files.push(...await tree(name));
      else if (entry.isFile()) files.push(name);
    }
    return files;
  } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
}
export async function fingerprint(kind) {
  const files = ['package.json', 'package-lock.json', 'backend/package.json', 'frontend/package.json'].map(f => path.join(root, f));
  if (kind !== 'dependencies') files.push(path.join(root, 'database/schema.prisma'), path.join(root, 'scripts/setup-cache.mjs'));
  if (kind === 'runtime') {
    for (const dir of ['backend/src', 'frontend/src', 'frontend/public']) files.push(...await tree(path.join(root, dir)));
    for (const f of ['next.config.ts', 'next.config.js', 'next.config.mjs', 'tsconfig.json']) files.push(path.join(root, 'frontend', f));
    files.push(path.join(config, process.env.GOCTRO_SETUP_CONFIG_DIR ? 'backend.env' : '.env'));
    files.push(path.join(process.env.GOCTRO_SETUP_CONFIG_DIR || path.join(root, 'frontend'), process.env.GOCTRO_SETUP_CONFIG_DIR ? 'frontend.env' : '.env.local'));
    files.push(path.join(root, 'scripts/dev-all.ps1'));
  }
  const hash = createHash('sha256');
  hash.update(JSON.stringify([process.version, process.platform, process.arch, process.env.GOCTRO_SETUP_NPM_VERSION,
    process.env.npm_config_omit, process.env.npm_config_ignore_scripts, process.env.NODE_ENV, kind,
    kind === 'runtime' ? [process.env.DATABASE_URL, process.env.SESSION_SECRET, process.env.FRONTEND_ORIGIN] : null]));
  for (const file of files) hash.update(file).update(await bytes(file));
  return hash.digest('hex');
}
async function main() {
  const [action, kind] = process.argv.slice(2);
  if (action === 'installed') {
    let ready = true;
    const require = createRequire(path.join(root, 'package.json'));
    try {
      for (const name of ['pg', '@prisma/client', 'tsx/cli', 'next/package.json']) require.resolve(name);
      for (const name of ['tsx.cmd','next.cmd','prisma.cmd','concurrently.cmd']) await access(path.join(root, 'node_modules/.bin', name));
    } catch { ready = false; }
    const result = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d','/c','npm.cmd ls --workspaces --include=dev --depth=0 --json'], {cwd:root,stdio:'ignore',windowsHide:true});
    console.log(ready && result.status === 0 ? 'READY' : 'MISSING');
    return;
  }
  if (!['check', 'record', 'invalidate'].includes(action) || !['dependencies', 'prisma', 'runtime'].includes(kind)) throw new Error('Lệnh cache không hợp lệ.');
  const stamp = path.join(directory, `${kind}.sha256`);
  if (action === 'invalidate') { await rm(stamp, {force:true}); return; }
  const current = await fingerprint(kind);
  if (action === 'record') {
    await mkdir(directory, { recursive: true });
    const temporary = `${stamp}.${process.pid}.tmp`;
    await writeFile(temporary, current);
    await rename(temporary, stamp);
  } else {
    let ready = (await bytes(stamp)).toString() === current;
    if (kind === 'prisma') {
      try { await access(path.join(root, 'node_modules/.prisma/client/index.js')); } catch { ready = false; }
    }
    console.log(ready ? 'CURRENT' : 'CHANGED');
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`Không đọc/ghi được dấu vết setup (mã ${error.code || 'UNKNOWN'}).`); process.exitCode = 1; });
}
