import {
  logDebug,
  logError,
  logInfo,
  logWarn,
  resolveLogLevel,
} from './logging';

describe('logging level filtering', () => {
  const originalAdoLevel = process.env.AZURE_DEVOPS_LOG_LEVEL;
  const originalLogLevel = process.env.LOG_LEVEL;
  let stderrChunks: string[];
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    delete process.env.AZURE_DEVOPS_LOG_LEVEL;
    delete process.env.LOG_LEVEL;
    stderrChunks = [];
    stderrSpy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: unknown) => {
        stderrChunks.push(String(chunk));
        return true;
      });
  });

  afterEach(() => {
    stderrSpy.mockRestore();
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

  it('resolves AZURE_DEVOPS_LOG_LEVEL with LOG_LEVEL fallback and info default', () => {
    expect(resolveLogLevel({})).toBe('info');
    expect(resolveLogLevel({ LOG_LEVEL: 'WARN' })).toBe('warn');
    expect(
      resolveLogLevel({
        AZURE_DEVOPS_LOG_LEVEL: 'error',
        LOG_LEVEL: 'debug',
      }),
    ).toBe('error');
    expect(resolveLogLevel({ AZURE_DEVOPS_LOG_LEVEL: 'invalid' })).toBe('info');
  });

  it('filters stderr output according to configured threshold', () => {
    process.env.AZURE_DEVOPS_LOG_LEVEL = 'error';
    logDebug('dbg');
    logInfo('inf');
    logWarn('wrn');
    logError('err');
    expect(stderrChunks).toEqual(['err\n']);

    stderrChunks.length = 0;
    process.env.AZURE_DEVOPS_LOG_LEVEL = 'debug';
    logDebug('dbg');
    logInfo('inf');
    logWarn('wrn');
    logError('err');
    expect(stderrChunks).toEqual(['dbg\n', 'inf\n', 'WARNING: wrn\n', 'err\n']);

    // Explicit env overrides process.env hermetically
    stderrChunks.length = 0;
    const strictEnv = { AZURE_DEVOPS_LOG_LEVEL: 'warn' };
    logInfo('suppressed-info', strictEnv);
    logWarn('visible-warn', strictEnv);
    logError('visible-error', strictEnv);
    expect(stderrChunks).toEqual([
      'WARNING: visible-warn\n',
      'visible-error\n',
    ]);
  });
});
