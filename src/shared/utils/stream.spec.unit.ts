import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { EventEmitter } from 'events';
import { Readable } from 'stream';
import { AzureDevOpsError } from '../errors/index.ts';
import {
  isLikelyBinaryBuffer,
  StreamSizeLimitError,
  streamToBuffer,
  streamToString,
} from './stream.ts';

void describe('stream utilities', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  void it('reads single and multi-chunk streams into Buffer and UTF-8 string', async () => {
    const single = await streamToBuffer(Readable.from([Buffer.from('hello')]));
    assert.strictEqual(single.toString('utf8'), 'hello');

    const multi = await streamToString(
      Readable.from(['héllo ', Buffer.from('wörld')]),
    );
    assert.strictEqual(multi, 'héllo wörld');
  });

  void it('rejects with StreamSizeLimitError and destroys the stream when maxBytes is exceeded', async () => {
    const stream = new Readable({
      read() {
        this.push(Buffer.alloc(64, 0x61));
      },
    });
    const destroySpy = mock.method(stream, 'destroy');

    const err = await streamToBuffer(stream, 32).catch((e: unknown) => e);
    assert.ok(err instanceof StreamSizeLimitError);
    assert.strictEqual(err.maxBytes, 32);
    assert.ok(destroySpy.mock.callCount() >= 1);
  });

  void it('rejects promptly when the stream emits error', async () => {
    const stream = new Readable({
      read() {
        this.destroy(new Error('socket reset'));
      },
    });

    await assert.rejects(() => streamToBuffer(stream), /socket reset/);
  });

  void it('rejects promptly instead of hanging when a stream closes prematurely without emitting end', async () => {
    const emitter = new EventEmitter() as unknown as NodeJS.ReadableStream;
    const pending = streamToBuffer(emitter);

    emitter.emit('data', Buffer.from('partial'));
    emitter.emit('close');

    await assert.rejects(pending, (err: unknown) => {
      assert.ok(err instanceof AzureDevOpsError);
      assert.match(err.message, /closed prematurely/i);
      return true;
    });
  });

  void it('detects binary buffers via NUL bytes in leading window', () => {
    assert.strictEqual(
      isLikelyBinaryBuffer(Buffer.from('plain utf-8 text')),
      false,
    );
    assert.strictEqual(
      isLikelyBinaryBuffer(Buffer.from([0x89, 0x50, 0x00, 0x47])),
      true,
    );
  });
});
