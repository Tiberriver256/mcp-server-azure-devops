import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deflateRawSync } from 'zlib';
import { AzureDevOpsError } from '../errors/index.ts';
import { readZipArchive } from './zip-reader.ts';

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface CustomZipOptions {
  name: string;
  data: Buffer;
  method?: 0 | 8;
  flags?: number;
  useDataDescriptor?: boolean;
  useZip64?: boolean;
  spoofedUncompressedSize?: number;
  eocdComment?: string;
}

function buildCustomZip(opts: CustomZipOptions): Buffer {
  const method = opts.method ?? 8;
  const nameBuf = Buffer.from(opts.name, 'utf8');
  const compressed = method === 8 ? deflateRawSync(opts.data) : opts.data;
  const crc = crc32(opts.data);
  const flags =
    (opts.flags ?? 0x0800) | (opts.useDataDescriptor ? 0x0008 : 0x0000);
  const reportedUncompressed = opts.spoofedUncompressedSize ?? opts.data.length;

  // Local file header (30 bytes + filename)
  const lfh = Buffer.alloc(30 + nameBuf.length);
  lfh.writeUInt32LE(0x04034b50, 0);
  lfh.writeUInt16LE(opts.useZip64 ? 45 : 20, 4);
  lfh.writeUInt16LE(flags, 6);
  lfh.writeUInt16LE(method, 8);
  lfh.writeUInt32LE(opts.useDataDescriptor ? 0 : crc, 14);
  lfh.writeUInt32LE(opts.useDataDescriptor ? 0 : compressed.length, 18);
  lfh.writeUInt32LE(opts.useDataDescriptor ? 0 : reportedUncompressed, 22);
  lfh.writeUInt16LE(nameBuf.length, 26);
  lfh.writeUInt16LE(0, 28);
  nameBuf.copy(lfh, 30);

  const dataDescriptor = opts.useDataDescriptor
    ? (() => {
        const dd = Buffer.alloc(16);
        dd.writeUInt32LE(0x08074b50, 0);
        dd.writeUInt32LE(crc, 4);
        dd.writeUInt32LE(compressed.length, 8);
        dd.writeUInt32LE(reportedUncompressed, 12);
        return dd;
      })()
    : Buffer.alloc(0);

  const localPart = Buffer.concat([lfh, compressed, dataDescriptor]);
  const cdOffset = localPart.length;

  // Optional ZIP64 extra field in central directory
  const zip64Extra = opts.useZip64
    ? (() => {
        const extra = Buffer.alloc(4 + 24);
        extra.writeUInt16LE(0x0001, 0);
        extra.writeUInt16LE(24, 2);
        extra.writeBigUInt64LE(BigInt(reportedUncompressed), 4);
        extra.writeBigUInt64LE(BigInt(compressed.length), 12);
        extra.writeBigUInt64LE(0n, 20);
        return extra;
      })()
    : Buffer.alloc(0);

  const cdh = Buffer.alloc(46 + nameBuf.length + zip64Extra.length);
  cdh.writeUInt32LE(0x02014b50, 0);
  cdh.writeUInt16LE(opts.useZip64 ? 45 : 20, 4);
  cdh.writeUInt16LE(opts.useZip64 ? 45 : 20, 6);
  cdh.writeUInt16LE(flags, 8);
  cdh.writeUInt16LE(method, 10);
  cdh.writeUInt32LE(crc, 16);
  cdh.writeUInt32LE(opts.useZip64 ? 0xffffffff : compressed.length, 20);
  cdh.writeUInt32LE(opts.useZip64 ? 0xffffffff : reportedUncompressed, 24);
  cdh.writeUInt16LE(nameBuf.length, 28);
  cdh.writeUInt16LE(zip64Extra.length, 30);
  cdh.writeUInt16LE(0, 32);
  cdh.writeUInt32LE(opts.useZip64 ? 0xffffffff : 0, 42);
  nameBuf.copy(cdh, 46);
  zip64Extra.copy(cdh, 46 + nameBuf.length);

  let zip64Trailer = Buffer.alloc(0);
  if (opts.useZip64) {
    const zip64EocdOffset = cdOffset + cdh.length;
    const zip64Eocd = Buffer.alloc(56);
    zip64Eocd.writeUInt32LE(0x06064b50, 0);
    zip64Eocd.writeBigUInt64LE(44n, 4);
    zip64Eocd.writeUInt16LE(45, 12);
    zip64Eocd.writeUInt16LE(45, 14);
    zip64Eocd.writeBigUInt64LE(1n, 24);
    zip64Eocd.writeBigUInt64LE(1n, 32);
    zip64Eocd.writeBigUInt64LE(BigInt(cdh.length), 40);
    zip64Eocd.writeBigUInt64LE(BigInt(cdOffset), 48);

    const zip64Locator = Buffer.alloc(20);
    zip64Locator.writeUInt32LE(0x07064b50, 0);
    zip64Locator.writeUInt32LE(0, 4);
    zip64Locator.writeBigUInt64LE(BigInt(zip64EocdOffset), 8);
    zip64Locator.writeUInt32LE(1, 16);

    zip64Trailer = Buffer.concat([zip64Eocd, zip64Locator]);
  }

  const commentBuf = Buffer.from(opts.eocdComment ?? '', 'utf8');
  const eocd = Buffer.alloc(22 + commentBuf.length);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(opts.useZip64 ? 0xffff : 1, 8);
  eocd.writeUInt16LE(opts.useZip64 ? 0xffff : 1, 10);
  eocd.writeUInt32LE(opts.useZip64 ? 0xffffffff : cdh.length, 12);
  eocd.writeUInt32LE(opts.useZip64 ? 0xffffffff : cdOffset, 16);
  eocd.writeUInt16LE(commentBuf.length, 20);
  commentBuf.copy(eocd, 22);

  return Buffer.concat([localPart, cdh, zip64Trailer, eocd]);
}

void describe('zip-reader edge cases & security guards', () => {
  void it('reads ZIP64 archives (ZIP64 EOCD, locator, and 64-bit extra fields)', () => {
    const payload = 'ZIP64 content with UTF-8 café';
    const archiveBuf = buildCustomZip({
      name: 'reports/summary.txt',
      data: Buffer.from(payload, 'utf8'),
      useZip64: true,
    });

    const zip = readZipArchive(archiveBuf);
    assert.strictEqual(zip.entries.length, 1);
    const entry = zip.findEntry('reports/summary.txt');
    assert.ok(entry !== undefined);
    assert.strictEqual(zip.readEntryText(entry), payload);
  });

  void it('reads streamed entries with data descriptors (zero sizes in local header)', () => {
    const archiveBuf = buildCustomZip({
      name: 'logs/build.log',
      data: Buffer.from('line1\nline2\n', 'utf8'),
      useDataDescriptor: true,
    });

    const zip = readZipArchive(archiveBuf);
    const entry = zip.findEntry('logs/build.log');
    assert.ok(entry !== undefined);
    assert.strictEqual(zip.readEntryText(entry), 'line1\nline2\n');
  });

  void it('reads archives with trailing EOCD comments', () => {
    const archiveBuf = buildCustomZip({
      name: 'note.txt',
      data: Buffer.from('commented archive', 'utf8'),
      eocdComment: 'Generated by Azure Pipelines',
    });

    const zip = readZipArchive(archiveBuf);
    assert.strictEqual(zip.readEntryText(zip.entries[0]), 'commented archive');
  });

  void it('blocks lying-header zip bombs where deflate output exceeds maxBytes despite spoofed central directory size', () => {
    const bigPayload = Buffer.alloc(64 * 1024, 0x41);
    const archiveBuf = buildCustomZip({
      name: 'bomb.txt',
      data: bigPayload,
      method: 8,
      spoofedUncompressedSize: 16,
    });

    const zip = readZipArchive(archiveBuf);
    assert.throws(
      () => zip.readEntryBuffer(zip.entries[0], 1024),
      AzureDevOpsError,
    );
  });

  void it('rejects encrypted ZIP entries explicitly', () => {
    const archiveBuf = buildCustomZip({
      name: 'secret.txt',
      data: Buffer.from('classified', 'utf8'),
      flags: 0x0801,
    });

    assert.throws(
      () => readZipArchive(archiveBuf),
      /Encrypted ZIP archives are not supported/i,
    );
  });

  void it('recognizes trailing backslash directory entries on Windows archives', () => {
    const archiveBuf = buildCustomZip({
      name: 'drop\\logs\\',
      data: Buffer.alloc(0),
      method: 0,
    });

    const zip = readZipArchive(archiveBuf);
    assert.strictEqual(zip.entries[0].isDirectory, true);
    assert.deepStrictEqual(
      zip.readEntryBuffer(zip.entries[0]),
      Buffer.alloc(0),
    );
  });

  void it('handles maxBytes === 0 safely for both empty and non-empty deflated entries and rejects negative limits', () => {
    const emptyZip = readZipArchive(
      buildCustomZip({ name: 'empty.txt', data: Buffer.alloc(0), method: 8 }),
    );
    assert.deepStrictEqual(
      emptyZip.readEntryBuffer(emptyZip.entries[0], 0),
      Buffer.alloc(0),
    );

    const nonEmptyZip = readZipArchive(
      buildCustomZip({
        name: 'onebyte.txt',
        data: Buffer.from('x', 'utf8'),
        method: 8,
        spoofedUncompressedSize: 0,
      }),
    );
    assert.throws(
      () => nonEmptyZip.readEntryBuffer(nonEmptyZip.entries[0], 0),
      AzureDevOpsError,
    );

    assert.throws(
      () => emptyZip.readEntryBuffer(emptyZip.entries[0], -1),
      /Invalid maxBytes limit/i,
    );
  });
});
