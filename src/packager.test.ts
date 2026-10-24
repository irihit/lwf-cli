import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createPackage, shouldExclude } from './packager.js';
import { loadConfig, DEFAULT_EXCLUDES } from './config.js';

describe('packager', () => {
  test('shouldExclude matches DEFAULT_EXCLUDES correctly', () => {
    assert.equal(shouldExclude('.git', DEFAULT_EXCLUDES), true);
    assert.equal(shouldExclude('.git/config', DEFAULT_EXCLUDES), true);
    assert.equal(shouldExclude('.env', DEFAULT_EXCLUDES), true);
    assert.equal(shouldExclude('.env.production', DEFAULT_EXCLUDES), true);
    assert.equal(shouldExclude('.lwf/state.json', DEFAULT_EXCLUDES), true);
    assert.equal(shouldExclude('.lwf/my-app-latest.zip', DEFAULT_EXCLUDES), true);
    assert.equal(shouldExclude('lwf.config.ts', DEFAULT_EXCLUDES), true);
    assert.equal(shouldExclude('lwf.config.json', DEFAULT_EXCLUDES), true);
    assert.equal(shouldExclude('lwf.config.js', DEFAULT_EXCLUDES), true);
    assert.equal(shouldExclude('node_modules/.cache/item.js', DEFAULT_EXCLUDES), true);

    // Should NOT exclude standard app files or assets
    assert.equal(shouldExclude('assets/sample.zip', DEFAULT_EXCLUDES), false);
    assert.equal(shouldExclude('index.js', DEFAULT_EXCLUDES), false);
    assert.equal(shouldExclude('src/app.js', DEFAULT_EXCLUDES), false);
    assert.equal(shouldExclude('node_modules/express/index.js', DEFAULT_EXCLUDES), false);
  });

  test('shouldExclude matches custom wildcards and path patterns', () => {
    const custom = ['test/**', 'docs/*', '*.md', '*.zip'];
    assert.equal(shouldExclude('test/unit/foo.test.js', custom), true);
    assert.equal(shouldExclude('docs/README.txt', custom), true);
    assert.equal(shouldExclude('README.md', custom), true);
    assert.equal(shouldExclude('package.zip', custom), true);
    assert.equal(shouldExclude('dist/bundle.zip', custom), true);
    assert.equal(shouldExclude('src/index.js', custom), false);
  });

  test('createPackage produces zip and sha256 checksum', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lwf-pkg-'));
    try {
      const cfgPath = path.join(tmpDir, 'lwf.config.ts');
      fs.writeFileSync(cfgPath, "export default { lambda: { FunctionName: 'test-pkg' } };\n", 'utf-8');
      fs.writeFileSync(path.join(tmpDir, 'index.js'), "console.log('hi');", 'utf-8');
      fs.writeFileSync(path.join(tmpDir, '.env.secret'), 'SECRET=123', 'utf-8');

      const config = await loadConfig(cfgPath);
      const res = await createPackage(config);

      assert.equal(fs.existsSync(res.zipPath), true);
      assert.equal(res.fileCount, 1); // only index.js, excluded .env and lwf.config.ts
      assert.equal(res.sha256.length, 64);
      assert.equal(typeof res.sizeStr, 'string');

      // Verify zip header signature (PK\x03\x04 = 0x04034b50)
      const zipContent = fs.readFileSync(res.zipPath);
      assert.equal(zipContent.readUInt32LE(0), 0x04034b50);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('createPackage packages multi-entry mappings ({ src: "dist", dest: "." }, "node_modules", "package.json")', async () => {
    function listZipEntries(zipBuffer: Buffer): string[] {
      const entries: string[] = [];
      let idx = 0;
      while (idx < zipBuffer.length - 4) {
        if (zipBuffer.readUInt32LE(idx) === 0x02014b50) {
          const nameLen = zipBuffer.readUInt16LE(idx + 28);
          const extraLen = zipBuffer.readUInt16LE(idx + 30);
          const commentLen = zipBuffer.readUInt16LE(idx + 32);
          const name = zipBuffer.subarray(idx + 46, idx + 46 + nameLen).toString('utf8');
          entries.push(name);
          idx += 46 + nameLen + extraLen + commentLen;
        } else {
          idx++;
        }
      }
      return entries;
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lwf-pkg-multi-'));
    try {
      const distDir = path.join(tmpDir, 'dist');
      const libDir = path.join(tmpDir, 'node_modules', 'my-lib');
      const cacheDir = path.join(tmpDir, 'node_modules', '.cache');
      fs.mkdirSync(distDir, { recursive: true });
      fs.mkdirSync(libDir, { recursive: true });
      fs.mkdirSync(cacheDir, { recursive: true });

      fs.writeFileSync(path.join(distDir, 'index.js'), 'export const handler = () => {};', 'utf-8');
      fs.writeFileSync(path.join(distDir, 'utils.js'), 'export const util = 1;', 'utf-8');
      fs.writeFileSync(path.join(libDir, 'index.js'), 'module.exports = {};', 'utf-8');
      fs.writeFileSync(path.join(cacheDir, 'cache.bin'), 'cache data', 'utf-8');
      fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"app","type":"module"}', 'utf-8');
      fs.writeFileSync(path.join(tmpDir, '.env'), 'SECRET=val', 'utf-8');

      const cfgPath = path.join(tmpDir, 'lwf.config.ts');
      fs.writeFileSync(
        cfgPath,
        `export default {
          lambda: { FunctionName: 'test-ts-app' },
          Code: [
            { src: 'dist', dest: '.' },
            'node_modules',
            'package.json'
          ]
        };\n`,
        'utf-8'
      );

      const config = await loadConfig(cfgPath);
      const res = await createPackage(config);

      assert.equal(fs.existsSync(res.zipPath), true);
      assert.equal(res.fileCount, 4);

      const zipBuf = fs.readFileSync(res.zipPath);
      const entries = listZipEntries(zipBuf);

      assert.deepEqual(entries, [
        'index.js',
        'node_modules/my-lib/index.js',
        'package.json',
        'utils.js',
      ]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('createPackage packages array of paths preserving directory structure', async () => {
    function listZipEntries(zipBuffer: Buffer): string[] {
      const entries: string[] = [];
      let idx = 0;
      while (idx < zipBuffer.length - 4) {
        if (zipBuffer.readUInt32LE(idx) === 0x02014b50) {
          const nameLen = zipBuffer.readUInt16LE(idx + 28);
          const extraLen = zipBuffer.readUInt16LE(idx + 30);
          const commentLen = zipBuffer.readUInt16LE(idx + 32);
          const name = zipBuffer.subarray(idx + 46, idx + 46 + nameLen).toString('utf8');
          entries.push(name);
          idx += 46 + nameLen + extraLen + commentLen;
        } else {
          idx++;
        }
      }
      return entries;
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lwf-pkg-arr-'));
    try {
      const distDir = path.join(tmpDir, 'dist');
      fs.mkdirSync(distDir, { recursive: true });
      fs.writeFileSync(path.join(distDir, 'index.js'), 'export const handler = () => {};', 'utf-8');

      const cfgPath = path.join(tmpDir, 'lwf.config.ts');
      fs.writeFileSync(
        cfgPath,
        `export default {
          lambda: { FunctionName: 'test-arr-app' },
          Code: ['dist']
        };\n`,
        'utf-8'
      );

      const config = await loadConfig(cfgPath);
      const res = await createPackage(config);

      const zipBuf = fs.readFileSync(res.zipPath);
      const entries = listZipEntries(zipBuf);

      assert.deepEqual(entries, ['dist/index.js']);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
