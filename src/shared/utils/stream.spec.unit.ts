import { EventEmitter } from 'events';
import { Readable } from 'stream';
import { AzureDevOpsError } from '../errors';
import {
  isLikelyBinaryBuffer,
  StreamSizeLimitError,
  streamToBuffer,
  streamToString,
} from './stream';

describe('stream utilities', () => {
  it('reads single and multi-chunk streams into Buffer and UTF-8 string', async () => {
    const single = await streamToBuffer(Readable.from([Buffer.from('hello')]));
    expect(single.toString('utf8')).toBe('hello');

    const multi = await streamToString(
      Readable.from(['héllo ', Buffer.from('wörld')]),
    );
    expect(multi).toBe('héllo wörld');
  });

  it('rejects with StreamSizeLimitError and destroys the stream when maxBytes is exceeded', async () => {
    const stream = new Readable({
      read() {
        this.push(Buffer.alloc(64, 0x61));
      },
    });
    const destroySpy = jest.spyOn(stream, 'destroy');

    const err = await streamToBuffer(stream, 32).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StreamSizeLimitError);
    expect((err as StreamSizeLimitError).maxBytes).toBe(32);
    expect(destroySpy).toHaveBeenCalled();
  });

  it('rejects promptly when the stream emits error', async () => {
    const stream = new Readable({
      read() {
        this.destroy(new Error('socket reset'));
      },
    });

    await expect(streamToBuffer(stream)).rejects.toThrow('socket reset');
  });

  it('rejects promptly instead of hanging when a stream closes prematurely without emitting end', async () => {
    const emitter = new EventEmitter() as unknown as NodeJS.ReadableStream;
    const pending = streamToBuffer(emitter);

    emitter.emit('data', Buffer.from('partial'));
    emitter.emit('close');

    await expect(pending).rejects.toThrow(AzureDevOpsError);
    await expect(pending).rejects.toThrow(/closed prematurely/i);
  });

  it('detects binary buffers via NUL bytes in leading window', () => {
    expect(isLikelyBinaryBuffer(Buffer.from('plain utf-8 text'))).toBe(false);
    expect(isLikelyBinaryBuffer(Buffer.from([0x89, 0x50, 0x00, 0x47]))).toBe(
      true,
    );
  });
});
