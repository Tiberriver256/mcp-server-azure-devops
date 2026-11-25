import { inflateRawSync } from 'zlib';
import { AzureDevOpsError } from '../errors';

const EOCD_SIGNATURE = 0x06054b50;
const ZIP64_EOCD_LOCATOR_SIGNATURE = 0x07064b50;
const ZIP64_EOCD_SIGNATURE = 0x06064b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ZIP64_EXTRA_HEADER_ID = 0x0001;

const MAX_EOCD_SEARCH = 22 + 0xffff;
const UTF8_FLAG_MASK = 0x0800;
const UINT16_MAX = 0xffff;
const UINT32_MAX = 0xffffffff;

export const DEFAULT_MAX_ZIP_ENTRIES = 50_000;
export const DEFAULT_MAX_ZIP_ENTRY_BYTES = 25 * 1024 * 1024; // 25 MiB

export interface ZipEntryMeta {
  readonly name: string;
  readonly isDirectory: boolean;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly compressionMethod: number;
  readonly localHeaderOffset: number;
}

export interface ZipArchiveOptions {
  maxEntries?: number;
  maxEntryBytes?: number;
}

export interface ZipArchive {
  readonly entries: readonly ZipEntryMeta[];
  findEntry(name: string): ZipEntryMeta | undefined;
  readEntryBuffer(entry: ZipEntryMeta, maxBytes?: number): Buffer;
  readEntryText(entry: ZipEntryMeta, maxBytes?: number): string;
}

function toBuffer(input: Buffer | Uint8Array | ArrayBuffer): Buffer {
  if (Buffer.isBuffer(input)) {
    return input;
  }
  if (ArrayBuffer.isView(input)) {
    return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  }
  return Buffer.from(input);
}

function readSafeBigUInt64LE(buf: Buffer, offset: number): number {
  const value = buf.readBigUInt64LE(offset);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new AzureDevOpsError('ZIP64 field exceeds safe integer range');
  }
  return Number(value);
}

function findEndOfCentralDirectory(buf: Buffer): number {
  if (buf.length < 22) {
    throw new AzureDevOpsError('Invalid ZIP archive: buffer too small');
  }
  const minOffset = Math.max(0, buf.length - MAX_EOCD_SEARCH);
  for (let offset = buf.length - 22; offset >= minOffset; offset--) {
    if (buf.readUInt32LE(offset) === EOCD_SIGNATURE) {
      const commentLength = buf.readUInt16LE(offset + 20);
      if (offset + 22 + commentLength === buf.length) {
        return offset;
      }
    }
  }
  throw new AzureDevOpsError(
    'Invalid ZIP archive: end of central directory signature not found',
  );
}

function parseZip64ExtraField(
  extra: Buffer,
  needUncompressed: boolean,
  needCompressed: boolean,
  needLocalOffset: boolean,
): {
  uncompressedSize?: number;
  compressedSize?: number;
  localHeaderOffset?: number;
} {
  let cursor = 0;
  while (cursor + 4 <= extra.length) {
    const headerId = extra.readUInt16LE(cursor);
    const dataSize = extra.readUInt16LE(cursor + 2);
    const dataStart = cursor + 4;
    const dataEnd = dataStart + dataSize;
    if (dataEnd > extra.length) {
      break;
    }
    if (headerId === ZIP64_EXTRA_HEADER_ID) {
      let fieldCursor = dataStart;
      const out: {
        uncompressedSize?: number;
        compressedSize?: number;
        localHeaderOffset?: number;
      } = {};
      if (needUncompressed && fieldCursor + 8 <= dataEnd) {
        out.uncompressedSize = readSafeBigUInt64LE(extra, fieldCursor);
        fieldCursor += 8;
      }
      if (needCompressed && fieldCursor + 8 <= dataEnd) {
        out.compressedSize = readSafeBigUInt64LE(extra, fieldCursor);
        fieldCursor += 8;
      }
      if (needLocalOffset && fieldCursor + 8 <= dataEnd) {
        out.localHeaderOffset = readSafeBigUInt64LE(extra, fieldCursor);
      }
      return out;
    }
    cursor = dataEnd;
  }
  return {};
}

/**
 * Zero-dependency ZIP archive reader built on Node.js native zlib.
 * Reads entry metadata from the Central Directory (handling data descriptors
 * and ZIP64 archives) and enforces strict entry count & decompressed byte caps
 * to prevent zip-bomb OOM failures.
 */
export function readZipArchive(
  data: Buffer | Uint8Array | ArrayBuffer,
  options: ZipArchiveOptions = {},
): ZipArchive {
  const buf = toBuffer(data);
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ZIP_ENTRIES;
  const defaultMaxEntryBytes =
    options.maxEntryBytes ?? DEFAULT_MAX_ZIP_ENTRY_BYTES;

  const eocdOffset = findEndOfCentralDirectory(buf);
  let entryCount = buf.readUInt16LE(eocdOffset + 10);
  let centralDirSize = buf.readUInt32LE(eocdOffset + 12);
  let centralDirOffset = buf.readUInt32LE(eocdOffset + 16);

  // Check for ZIP64 End of Central Directory Locator right before EOCD
  if (
    eocdOffset >= 20 &&
    buf.readUInt32LE(eocdOffset - 20) === ZIP64_EOCD_LOCATOR_SIGNATURE
  ) {
    const zip64EocdOffset = readSafeBigUInt64LE(buf, eocdOffset - 12);
    if (
      zip64EocdOffset + 56 <= buf.length &&
      buf.readUInt32LE(zip64EocdOffset) === ZIP64_EOCD_SIGNATURE
    ) {
      if (entryCount === UINT16_MAX) {
        entryCount = readSafeBigUInt64LE(buf, zip64EocdOffset + 32);
      }
      if (centralDirSize === UINT32_MAX) {
        centralDirSize = readSafeBigUInt64LE(buf, zip64EocdOffset + 40);
      }
      if (centralDirOffset === UINT32_MAX) {
        centralDirOffset = readSafeBigUInt64LE(buf, zip64EocdOffset + 48);
      }
    }
  }

  if (entryCount > maxEntries) {
    throw new AzureDevOpsError(
      `ZIP archive entry count (${entryCount}) exceeds maximum allowed (${maxEntries})`,
    );
  }

  const centralDirEnd = centralDirOffset + centralDirSize;
  if (
    centralDirOffset < 0 ||
    centralDirSize < 0 ||
    centralDirEnd > buf.length
  ) {
    throw new AzureDevOpsError(
      'Invalid ZIP archive: central directory out of bounds',
    );
  }

  const entries: ZipEntryMeta[] = [];
  const entriesByName = new Map<string, ZipEntryMeta>();
  let cursor = centralDirOffset;

  for (let i = 0; i < entryCount; i++) {
    if (cursor + 46 > centralDirEnd) {
      throw new AzureDevOpsError(
        'Invalid ZIP archive: truncated central directory entry',
      );
    }
    if (buf.readUInt32LE(cursor) !== CENTRAL_DIR_SIGNATURE) {
      throw new AzureDevOpsError(
        'Invalid ZIP archive: invalid central directory signature',
      );
    }

    const flags = buf.readUInt16LE(cursor + 8);
    const compressionMethod = buf.readUInt16LE(cursor + 10);
    let compressedSize = buf.readUInt32LE(cursor + 20);
    let uncompressedSize = buf.readUInt32LE(cursor + 24);
    const fileNameLength = buf.readUInt16LE(cursor + 28);
    const extraFieldLength = buf.readUInt16LE(cursor + 30);
    const commentLength = buf.readUInt16LE(cursor + 32);
    let localHeaderOffset = buf.readUInt32LE(cursor + 42);

    const nameStart = cursor + 46;
    const extraStart = nameStart + fileNameLength;
    const nextCursor = extraStart + extraFieldLength + commentLength;
    if (nextCursor > centralDirEnd) {
      throw new AzureDevOpsError(
        'Invalid ZIP archive: central directory entry extends beyond directory',
      );
    }

    const nameEncoding = (flags & UTF8_FLAG_MASK) !== 0 ? 'utf8' : 'latin1';
    const name = buf.subarray(nameStart, extraStart).toString(nameEncoding);

    if (
      uncompressedSize === UINT32_MAX ||
      compressedSize === UINT32_MAX ||
      localHeaderOffset === UINT32_MAX
    ) {
      const zip64 = parseZip64ExtraField(
        buf.subarray(extraStart, extraStart + extraFieldLength),
        uncompressedSize === UINT32_MAX,
        compressedSize === UINT32_MAX,
        localHeaderOffset === UINT32_MAX,
      );
      if (zip64.uncompressedSize !== undefined) {
        uncompressedSize = zip64.uncompressedSize;
      }
      if (zip64.compressedSize !== undefined) {
        compressedSize = zip64.compressedSize;
      }
      if (zip64.localHeaderOffset !== undefined) {
        localHeaderOffset = zip64.localHeaderOffset;
      }
    }

    const meta: ZipEntryMeta = {
      name,
      isDirectory: name.endsWith('/'),
      compressedSize,
      uncompressedSize,
      compressionMethod,
      localHeaderOffset,
    };

    entries.push(meta);
    entriesByName.set(name, meta);
    cursor = nextCursor;
  }

  const readEntryBuffer = (
    entry: ZipEntryMeta,
    maxBytes: number = defaultMaxEntryBytes,
  ): Buffer => {
    if (entry.isDirectory) {
      return Buffer.alloc(0);
    }

    if (entry.uncompressedSize > maxBytes) {
      throw new AzureDevOpsError(
        `ZIP entry '${entry.name}' exceeds maximum allowed size of ${maxBytes} bytes`,
      );
    }

    const offset = entry.localHeaderOffset;
    if (offset < 0 || offset + 30 > buf.length) {
      throw new AzureDevOpsError(
        `Invalid ZIP archive: local file header out of bounds for '${entry.name}'`,
      );
    }

    if (buf.readUInt32LE(offset) !== LOCAL_FILE_HEADER_SIGNATURE) {
      throw new AzureDevOpsError(
        `Invalid ZIP archive: invalid local file header signature for '${entry.name}'`,
      );
    }

    const localNameLen = buf.readUInt16LE(offset + 26);
    const localExtraLen = buf.readUInt16LE(offset + 28);
    const dataStart = offset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + entry.compressedSize;

    if (dataStart < 0 || dataEnd > buf.length || dataEnd < dataStart) {
      throw new AzureDevOpsError(
        `Invalid ZIP archive: entry data out of bounds for '${entry.name}'`,
      );
    }

    const compressedData = buf.subarray(dataStart, dataEnd);

    if (entry.compressionMethod === 0) {
      if (compressedData.length > maxBytes) {
        throw new AzureDevOpsError(
          `ZIP entry '${entry.name}' exceeds maximum allowed size of ${maxBytes} bytes`,
        );
      }
      return Buffer.from(compressedData);
    }

    if (entry.compressionMethod === 8) {
      try {
        return inflateRawSync(compressedData, { maxOutputLength: maxBytes });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new AzureDevOpsError(
          `Failed to decompress ZIP entry '${entry.name}': ${message}`,
        );
      }
    }

    throw new AzureDevOpsError(
      `Unsupported ZIP compression method ${entry.compressionMethod} for '${entry.name}'`,
    );
  };

  return {
    entries,
    findEntry(name: string): ZipEntryMeta | undefined {
      return entriesByName.get(name);
    },
    readEntryBuffer,
    readEntryText(entry: ZipEntryMeta, maxBytes?: number): string {
      return readEntryBuffer(entry, maxBytes).toString('utf8');
    },
  };
}
