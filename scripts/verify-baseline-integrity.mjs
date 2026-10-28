import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

// No database client, environment file or connection configuration is loaded.
export async function verifyBaselineArtifacts() {
  let failed = false;
  for (const version of ['1.8', '1.9', '1.10', '1.11', '1.12', '1.13']) {
    const relativeDirectory = `database/baselines/v${version}/`;
    const manifest = JSON.parse(await readFile(path.join(root, relativeDirectory, 'PROVENANCE.json'), 'utf8'));
    if (manifest.version !== version) throw new Error(`Phiên bản baseline không phải V${version}.`);
    const candidateStatus = ['1.12', '1.13'].includes(version) && ['PENDING_LOCAL_CANDIDATE', 'PROMOTED_LOCAL_PENDING_SOURCE_COMMIT', 'PROMOTED_LOCAL'].includes(manifest.status);
    if (version === '1.12' && !candidateStatus) throw new Error('V1.12 source cần trạng thái candidate/promoted-local trước khi được kiểm tra.');
    if (version === '1.13' && !candidateStatus) throw new Error('V1.13 source cần trạng thái candidate/promoted-local trước khi được kiểm tra.');
    for (const [filename, expected] of Object.entries(manifest.sha256)) {
      const relativePath = relativeDirectory + filename;
      const workingTree = sha256(await readFile(path.join(root, relativePath)));
      const blob = spawnSync('git', ['cat-file', 'blob', `HEAD:${relativePath}`], { cwd: root });
      const pendingLocal = candidateStatus && blob.status !== 0;
      if (blob.status !== 0 && !pendingLocal) throw new Error(`Không đọc được artifact trong Git HEAD: V${version}/${filename}`);
      const head = pendingLocal ? manifest.status : sha256(blob.stdout);
      const attributes = spawnSync('git', ['check-attr', '-z', 'text', '--', relativePath], { cwd: root, encoding: 'utf8' });
      const bytePreserving = attributes.status === 0 && attributes.stdout.split('\0')[2] === 'unset';
      const pass = workingTree === expected && (pendingLocal || head === expected) && bytePreserving;
      console.log(JSON.stringify({ version, artifact: filename, expected, workingTree, head, bytePreserving, result: pass ? 'PASS' : 'FAIL' }));
      failed ||= !pass;
    }
  }
  if (failed) throw new Error('Artifact không khớp baseline. Giữ đúng bytes đã review; không tạo lại hash provenance để ép PASS.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyBaselineArtifacts().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
