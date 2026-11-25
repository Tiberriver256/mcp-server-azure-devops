import { AzureDevOpsError } from '../errors';

export const DEFAULT_MAX_STREAM_BYTES = 25 * 1024 * 1024; // 25 MiB

/**
 * Typed error raised when a stream exceeds its configured maximum byte limit.
 */
export class StreamSizeLimitError extends AzureDevOpsError {
  readonly maxBytes: number;

  constructor(maxBytes: number) {
    super(`Stream exceeded maximum allowed size of ${maxBytes} bytes`);
    this.name = 'StreamSizeLimitError';
    this.maxBytes = maxBytes;
  }
}

function isDestroyableStream(value: unknown): value is { destroy: () => void } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'destroy' in value &&
    typeof value.destroy === 'function'
  );
}

/**
 * Read a NodeJS.ReadableStream into a single Buffer with an optional byte cap
 * to prevent unbounded memory allocation on oversized responses.
 * Rejects cleanly if the stream errors or closes prematurely before emitting `end`.
 */
export async function streamToBuffer(
  stream: NodeJS.ReadableStream,
  maxBytes: number = DEFAULT_MAX_STREAM_BYTES,
): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let settled = false;

    const fail = (err: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      if (isDestroyableStream(stream)) {
        stream.destroy();
      }
      reject(err);
    };

    stream.on('data', (chunk: Buffer | Uint8Array | string) => {
      if (settled) {
        return;
      }
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buf.length;
      if (totalBytes > maxBytes) {
        fail(new StreamSizeLimitError(maxBytes));
        return;
      }
      chunks.push(buf);
    });

    stream.on('error', (err: unknown) => {
      fail(err instanceof Error ? err : new Error(String(err)));
    });

    stream.on('end', () => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(
        chunks.length === 1 ? chunks[0] : Buffer.concat(chunks, totalBytes),
      );
    });

    stream.on('close', () => {
      if (!settled) {
        fail(new AzureDevOpsError('Stream closed prematurely before end'));
      }
    });
  });
}

/**
 * Read a NodeJS.ReadableStream into a UTF-8 string with an optional byte cap.
 */
export async function streamToString(
  stream: NodeJS.ReadableStream,
  maxBytes: number = DEFAULT_MAX_STREAM_BYTES,
): Promise<string> {
  const buffer = await streamToBuffer(stream, maxBytes);
  return buffer.toString('utf8');
}

/**
 * Heuristic check for binary content (presence of NUL bytes in the leading window).
 */
export function isLikelyBinaryBuffer(buffer: Buffer): boolean {
  const sampleLength = Math.min(buffer.length, 8192);
  for (let i = 0; i < sampleLength; i++) {
    if (buffer[i] === 0) {
      return true;
    }
  }
  return false;
}
