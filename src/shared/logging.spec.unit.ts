import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import {
  logDebug,
  logError,
  logInfo,
  logWarn,
  resolveLogLevel,
} from './logging.ts';

void describe('logging level filtering', () => {
  const originalAdoLevel = process.env.AZURE_DEVOPS_LOG_LEVEL;
  const originalLogLevel = process.env.LOG_LEVEL;
  let stderrChunks: string[];

  beforeEach(() => {
    delete process.env.AZURE_DEVOPS_LOG_LEVEL;
    delete process.env.LOG_LEVEL;
    stderrChunks = [];
    mock.method(process.stderr, 'write', (chunk: unknown) => {
      stderrChunks.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    mock.restoreAll();
    if (originalAdoLevel === undefined) {
      delete process.env.AZURE_DEVOPS_LOG_LEVEL;
    } else {
      process.env.AZURE_DEVOPS_LOG_LEVEL = originalAdoLevel;
    }
    if (originalLogLevel === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = originalLogLevel;
    }
  });

  void it('resolves AZURE_DEVOPS_LOG_LEVEL with LOG_LEVEL fallback and info default', () => {
    assert.strictEqual(resolveLogLevel({}), 'info');
    assert.strictEqual(resolveLogLevel({ LOG_LEVEL: 'WARN' }), 'warn');
    assert.strictEqual(
      resolveLogLevel({
        AZURE_DEVOPS_LOG_LEVEL: 'error',
        LOG_LEVEL: 'debug',
      }),
      'error',
    );
    assert.strictEqual(
      resolveLogLevel({ AZURE_DEVOPS_LOG_LEVEL: 'invalid' }),
      'info',
    );
  });

  void it('filters stderr output according to configured threshold', () => {
    process.env.AZURE_DEVOPS_LOG_LEVEL = 'error';
    logDebug('dbg');
    logInfo('inf');
    logWarn('wrn');
    logError('err');
    assert.deepStrictEqual(stderrChunks, ['err\n']);

    stderrChunks.length = 0;
    process.env.AZURE_DEVOPS_LOG_LEVEL = 'debug';
    logDebug('dbg');
    logInfo('inf');
    logWarn('wrn');
    logError('err');
    assert.deepStrictEqual(stderrChunks, [
      'dbg\n',
      'inf\n',
      'WARNING: wrn\n',
      'err\n',
    ]);

    // Explicit env overrides process.env hermetically
    stderrChunks.length = 0;
    const strictEnv = { AZURE_DEVOPS_LOG_LEVEL: 'warn' };
    logInfo('suppressed-info', strictEnv);
    logWarn('visible-warn', strictEnv);
    logError('visible-error', strictEnv);
    assert.deepStrictEqual(stderrChunks, [
      'WARNING: visible-warn\n',
      'visible-error\n',
    ]);
  });
});
