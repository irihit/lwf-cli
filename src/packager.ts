/**
 * Packager module for bundling code into a zip archive for Lambda Web Functions.
 * Implements pure Node.js zero-dependency deterministic ZIP creation.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import * as ui from './ui.js';
import { LwfConfig, PackageResult } from './types.js';

export class PackagingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PackagingError';
  }
}

/**
 * CRC-32 lookup table for fallback when zlib.crc32 is unavailable.
 */
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c;
}

function computeCrc32(buf: Buffer): number {
  if (typeof (zlib as any).crc32 === 'function') {
    return (zlib as any).crc32(buf) >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  name: string;
  data: Buffer;
  isExecutable: boolean;
}

/**
 * Build a standard, deterministic PKWare ZIP archive buffer without external dependencies.
 */
function buildZipBuffer(entries: ZipEntry[]): Buffer {
  const parts: Buffer[] = [];
  const cdParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name.replace(/\\/g, '/'), 'utf8');
    const dataBuf = entry.data;
    const compressed = zlib.deflateRawSync(dataBuf, { level: 9 });
    const crc = computeCrc32(dataBuf);

    // 1. Local File Header (30 bytes + name length)
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); // Local file header signature
    lh.writeUInt16LE(20, 4);         // Version needed to extract (2.0)
    lh.writeUInt16LE(0x0800, 6);     // Flags (bit 11: UTF-8 filename)
    lh.writeUInt16LE(8, 8);          // Compression method: 8 (deflate)
    lh.writeUInt16LE(0, 10);         // Last mod file time (00:00:00)
    lh.writeUInt16LE(0x21, 12);      // Last mod file date (1980-01-01)
    lh.writeUInt32LE(crc, 14);       // CRC-32
    lh.writeUInt32LE(compressed.length, 18); // Compressed size
    lh.writeUInt32LE(dataBuf.length, 22);    // Uncompressed size
    lh.writeUInt16LE(nameBuf.length, 26);    // File name length
    lh.writeUInt16LE(0, 28);                 // Extra field length

    parts.push(lh, nameBuf, compressed);

    // 2. Central Directory File Header (46 bytes + name length)
    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0); // Central file header signature
    cdh.writeUInt16LE((3 << 8) | 20, 4); // Version made by: Unix (3) + 2.0 (20)
    cdh.writeUInt16LE(20, 6);         // Version needed to extract (2.0)
    cdh.writeUInt16LE(0x0800, 8);     // Flags (UTF-8 filename)
    cdh.writeUInt16LE(8, 10);         // Compression method: 8 (deflate)
    cdh.writeUInt16LE(0, 12);         // Last mod file time
    cdh.writeUInt16LE(0x21, 14);      // Last mod file date
    cdh.writeUInt32LE(crc, 16);       // CRC-32
    cdh.writeUInt32LE(compressed.length, 20); // Compressed size
    cdh.writeUInt32LE(dataBuf.length, 24);    // Uncompressed size
    cdh.writeUInt16LE(nameBuf.length, 28);    // File name length
    cdh.writeUInt16LE(0, 30);                 // Extra field length
    cdh.writeUInt16LE(0, 32);                 // File comment length
    cdh.writeUInt16LE(0, 34);                 // Disk number start
    cdh.writeUInt16LE(0, 36);                 // Internal file attributes
    const unixMode = entry.isExecutable ? 0o100755 : 0o100644;
    cdh.writeUInt32LE(((unixMode << 16) >>> 0), 38); // External file attributes (Unix file permissions)
    cdh.writeUInt32LE(offset, 42);            // Relative offset of local header

    cdParts.push(cdh, nameBuf);

    offset += lh.length + nameBuf.length + compressed.length;
  }

  const cdOffset = offset;
  let cdSize = 0;
  for (const p of cdParts) cdSize += p.length;

  // 3. End of Central Directory Record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
  eocd.writeUInt16LE(0, 4);          // Disk number
  eocd.writeUInt16LE(0, 6);          // Start disk
  eocd.writeUInt16LE(entries.length, 8); // Entries on disk
  eocd.writeUInt16LE(entries.length, 10); // Total entries
  eocd.writeUInt32LE(cdSize, 12);    // Central directory size
  eocd.writeUInt32LE(cdOffset, 16);  // Central directory offset
  eocd.writeUInt16LE(0, 20);         // Comment length

  return Buffer.concat([...parts, ...cdParts, eocd]);
}

/**
 * Check if a relative path matches any exclusion pattern.
 */
export function shouldExclude(relPath: string, patterns: string[]): boolean {
  const normPath = relPath.replace(/\\/g, '/');
  const parts = normPath.split('/');
  const basename = parts[parts.length - 1];

  for (const pat of patterns) {
    const normPat = pat.replace(/\\/g, '/');

    // Exact match
    if (normPath === normPat || basename === normPat) {
      return true;
    }

    // Wildcard prefix / suffix
    if (normPat.startsWith('*.') && basename.endsWith(normPat.slice(1))) {
      return true;
    }
    if (normPat.endsWith('/**')) {
      const prefix = normPat.slice(0, -3);
      if (normPath === prefix || normPath.startsWith(prefix + '/')) {
        return true;
      }
    }
    // Wildcard prefix (e.g. .env*, lwf.config.*, or dir/*)
    if (normPat.endsWith('*')) {
      const prefix = normPat.slice(0, -1);
      if (normPat.includes('/')) {
        if (normPath.startsWith(prefix)) return true;
      } else {
        if (basename.startsWith(prefix)) return true;
      }
    }

    // Directory match
    for (let i = 1; i <= parts.length; i++) {
      const subpath = parts.slice(0, i).join('/');
      if (subpath === normPat) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Recursively collect files to pack from a mapped entry.
 */
function collectEntryFiles(
  srcPath: string,
  destPrefix: string,
  excludes: string[],
  results: Map<string, { fullPath: string; relPath: string }>
): void {
  const stat = fs.statSync(srcPath);

  if (stat.isFile()) {
    let zipPath = destPrefix;
    if (!zipPath || zipPath === '.' || zipPath.endsWith('/')) {
      const cleanPrefix = zipPath === '.' || !zipPath ? '' : zipPath.replace(/\/+$/, '');
      zipPath = cleanPrefix ? `${cleanPrefix}/${path.basename(srcPath)}` : path.basename(srcPath);
    }
    zipPath = zipPath.replace(/\\/g, '/');

    if (!shouldExclude(zipPath, excludes)) {
      results.set(zipPath, { fullPath: srcPath, relPath: zipPath });
    }
    return;
  }

  if (stat.isDirectory()) {
    function walk(currentDir: string) {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        const relFromSrc = path.relative(srcPath, fullPath).replace(/\\/g, '/');

        let zipPath =
          destPrefix && destPrefix !== '.'
            ? `${destPrefix.replace(/\/+$/, '')}/${relFromSrc}`
            : relFromSrc;
        zipPath = zipPath.replace(/\\/g, '/');

        if (shouldExclude(zipPath, excludes) || shouldExclude(relFromSrc, excludes)) {
          continue;
        }

        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile()) {
          results.set(zipPath, { fullPath, relPath: zipPath });
        }
      }
    }

    walk(srcPath);
  }
}

/**
 * Package code directory into a zip archive and compute sha256 checksum.
 */
export async function createPackage(
  config: LwfConfig,
  outputZip?: string
): Promise<PackageResult> {
  const buildDir = path.join(config.rootDir, '.lwf');
  if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
  }

  const targetZip = outputZip || path.join(buildDir, `${config.name}-latest.zip`);
  const collectedMap = new Map<string, { fullPath: string; relPath: string }>();

  const mappings = config.Code || [{ src: config.codeDir, dest: '.' }];
  for (const mapping of mappings) {
    collectEntryFiles(mapping.src, mapping.dest, config.excludes, collectedMap);
  }

  if (collectedMap.size === 0) {
    throw new PackagingError(
      `No files found to package in '${config.codeDir}' after applying exclude filters.`
    );
  }

  // Sort files deterministically
  const files = Array.from(collectedMap.values()).sort((a, b) => a.relPath.localeCompare(b.relPath));

  const zipEntries: ZipEntry[] = files.map(({ fullPath, relPath }) => {
    const stat = fs.statSync(fullPath);
    const isExecutable = (stat.mode & 0o111) !== 0;
    const data = fs.readFileSync(fullPath);
    return { name: relPath, data, isExecutable };
  });

  const zipBuffer = buildZipBuffer(zipEntries);
  fs.writeFileSync(targetZip, zipBuffer);

  // Calculate SHA256
  const hash = crypto.createHash('sha256');
  hash.update(zipBuffer);
  const sha256 = hash.digest('hex');

  const sizeBytes = zipBuffer.length;
  let sizeStr = '';
  if (sizeBytes < 1024) {
    sizeStr = `${sizeBytes} B`;
  } else if (sizeBytes < 1024 * 1024) {
    sizeStr = `${(sizeBytes / 1024).toFixed(1)} KB`;
  } else {
    sizeStr = `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  // Save metadata
  fs.writeFileSync(
    path.join(buildDir, 'latest.meta'),
    `sha256=${sha256}\nsize=${sizeBytes}\nfiles=${files.length}\n`,
    'utf-8'
  );

  return {
    zipPath: targetZip,
    fileCount: files.length,
    sizeBytes,
    sizeStr,
    sha256,
  };
}
