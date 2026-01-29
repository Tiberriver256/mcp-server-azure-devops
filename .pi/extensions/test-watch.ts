import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  truncateTail,
} from '@mariozechner/pi-coding-agent';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';

type ReportMode = 'always' | 'changed';

const EXTENSION_VERSION = 4;

type WatchState = {
  version: number;

  proc: ChildProcess | null;
  cwd: string | null;
  command: string;
  commandOverride: string | null;

  // Rolling buffer of recent output (ANSI-stripped)
  lines: string[];

  // Last detected failing run (if any)
  lastFailureText: string | null;
  lastFailureId: string | null;
  lastFailureUpdatedAt: number | null;

  // Last detected passing summary (optional)
  lastPassText: string | null;

  // Whether we should keep the watcher running (set on session_start / cleared on shutdown)
  enabled: boolean;

  // Last observed status identifier:
  // - "pass" when tests are passing
  // - "fail:<signatureHash>" when failing
  // - null when status has not been detected yet
  lastStatusId: string | null;

  // Last status we reported to tool output (to avoid spamming)
  lastReportedStatusId: string | null;

  // Last status we injected into the conversation via pi.sendMessage()
  lastInjectedStatusId: string | null;

  // Debug UI widget (multi-line). Footer status is always shown.
  uiEnabled: boolean;

  // Whether to inject PASS/FAIL messages into the conversation (separate from the footer).
  notifyEnabled: boolean;

  // Runtime overrides (set via /testwatch). If null, use CLI flags.
  uiOverride: boolean | null;
  notifyOverride: boolean | null;

  uiPlacement: 'aboveEditor' | 'belowEditor';
  uiInterval: NodeJS.Timeout | null;
  uiLastRenderHash: string | null;

  // Callback invoked when watcher status changes
  statusChangeHandler: ((statusId: string) => void) | null;
  watcherHasStatusCallback: boolean;

  starting: boolean;
};

const GLOBAL_KEY = Symbol.for('pi.extension.testWatch.state');

function getState(): WatchState {
  const g = globalThis as unknown as Record<string | symbol, unknown>;
  let state = g[GLOBAL_KEY] as WatchState | undefined;
  if (!state) {
    state = {
      version: EXTENSION_VERSION,
      proc: null,
      cwd: null,
      command: defaultWatchCommand(),
      commandOverride: null,
      lines: [],
      lastFailureText: null,
      lastFailureId: null,
      lastFailureUpdatedAt: null,
      lastPassText: null,
      enabled: false,
      lastStatusId: null,
      lastReportedStatusId: null,
      lastInjectedStatusId: null,
      uiEnabled: false,
      notifyEnabled: false,
      uiOverride: null,
      notifyOverride: null,
      uiPlacement: 'aboveEditor',
      uiInterval: null,
      uiLastRenderHash: null,
      statusChangeHandler: null,
      watcherHasStatusCallback: false,
      starting: false,
    };
    g[GLOBAL_KEY] = state;
  }
  return state;
}

function stripAnsi(input: string): string {
  // eslint-disable-next-line no-control-regex
  return input.replace(/\u001b\[[0-9;]*m/g, '');
}

function defaultWatchCommand(): string {
  // Keep the default simple and repo-local.
  return 'npm run -s test:watch';
}

function getBoolFlag(pi: any, name: string, defaultValue: boolean): boolean {
  const v = pi.getFlag?.(name);
  if (v === undefined) return defaultValue;
  return Boolean(v);
}

function getStringFlag(pi: any, name: string, defaultValue: string): string {
  const v = pi.getFlag?.(name);
  if (v === undefined || v === null) return defaultValue;
  return typeof v === 'string' ? v : String(v);
}

function splitLines(chunk: string): string[] {
  // Normalize CRLF and carriage-return progress lines
  return chunk.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

function sha1(text: string): string {
  return createHash('sha1').update(text).digest('hex');
}

function formatTimestamp(ts: number | null): string {
  if (!ts) return 'unknown';
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return String(ts);
  }
}

function normalizePlacement(value: unknown): 'aboveEditor' | 'belowEditor' {
  return value === 'belowEditor' ? 'belowEditor' : 'aboveEditor';
}

function getStatusLabel(statusId: string | null): 'PASS' | 'FAIL' | 'UNKNOWN' {
  if (statusId === 'pass') return 'PASS';
  if (statusId?.startsWith('fail:')) return 'FAIL';
  return 'UNKNOWN';
}

function firstLine(text: string, max = 140): string {
  const line = text.split('\n').find((l) => l.trim().length > 0) ?? '';
  const trimmed = line.trim();
  return trimmed.length > max ? trimmed.slice(0, max - 1) + '…' : trimmed;
}

function detectFailureSummaryLine(
  line: string,
): { failed: number; framework: string } | null {
  // Jest: "Test Suites: 1 failed, 2 passed, 3 total"
  {
    const m = line.match(/Test Suites:\s*(\d+)\s*failed\b/i);
    if (m) return { failed: Number(m[1] ?? 0), framework: 'jest' };
  }

  // Vitest: "Test Files  1 failed (2)"
  {
    const m = line.match(/Test Files\s+(\d+)\s+failed\b/i);
    if (m) return { failed: Number(m[1] ?? 0), framework: 'vitest' };
  }

  // Mocha-ish: "1 failing"
  {
    const m = line.match(/^\s*(\d+)\s+failing\b/i);
    if (m) return { failed: Number(m[1] ?? 0), framework: 'mocha' };
  }

  // Fallback: a bare "FAIL" line
  if (/^\s*FAIL\b/.test(line)) return { failed: 1, framework: 'generic' };

  return null;
}

function detectPassSummaryLine(line: string): boolean {
  // Jest: "Test Suites: 58 passed, 58 total" (no "failed")
  if (/Test Suites:/i.test(line) && !/\bfailed\b/i.test(line)) return true;

  // Vitest: "Test Files  2 passed (2)" (no "failed")
  if (/Test Files\b/i.test(line) && !/\bfailed\b/i.test(line)) return true;

  // Mocha: "0 failing"
  if (/^\s*0\s+failing\b/i.test(line)) return true;

  // Watch mode w/ no related tests
  if (/No tests found\b/i.test(line)) return true;

  return false;
}

function extractPassSummary(lines: string[]): string {
  const tail = lines.slice(Math.max(0, lines.length - 120));
  const interesting = tail
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => {
      // Exclude volatile runtime info
      if (/^Time:\b/i.test(l)) return false;
      return (
        /^Test Suites:/i.test(l) ||
        /^Tests:/i.test(l) ||
        /^Snapshots:/i.test(l) ||
        /^Ran all test suites/i.test(l) ||
        /^No tests found/i.test(l) ||
        /^Test Files\b/i.test(l) ||
        /^\d+\s+passing\b/i.test(l) ||
        /^\d+\s+failing\b/i.test(l)
      );
    });

  const text =
    interesting.length > 0 ? interesting.join('\n') : (tail.at(-1) ?? 'PASS');
  return truncateTail(text, {
    maxLines: 20,
    maxBytes: 4 * 1024,
  }).content.trim();
}

function buildFailureSignature(lines: string[]): string {
  const tail = lines.slice(Math.max(0, lines.length - 250));
  const interesting = tail
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => {
      // Exclude volatile runtime info
      if (/^Time:\b/i.test(l)) return false;
      return (
        /^FAIL\b/.test(l) ||
        /^●\s+/.test(l) ||
        /^Test Suites:/i.test(l) ||
        /^Tests:/i.test(l) ||
        /^Snapshots:/i.test(l) ||
        /^Test Files\b/i.test(l) ||
        /^\d+\s+failing\b/i.test(l)
      );
    });

  const text =
    interesting.length > 0
      ? interesting.join('\n')
      : tail.slice(-30).join('\n');
  return sha1(text);
}

function updateFailureStateFromOutput(state: WatchState): void {
  // Scan backwards (tail is most likely to contain the summary)
  const scanLimit = Math.min(state.lines.length, 200);
  for (let i = 0; i < scanLimit; i++) {
    const line = state.lines[state.lines.length - 1 - i] ?? '';

    if (detectPassSummaryLine(line)) {
      state.lastFailureText = null;
      state.lastFailureId = null;
      state.lastPassText = extractPassSummary(state.lines);
      state.lastFailureUpdatedAt = Date.now();
      state.lastStatusId = 'pass';
      return;
    }

    const fail = detectFailureSummaryLine(line);
    if (fail && fail.failed > 0) {
      // Capture a compact tail as the "current failure report"
      const tail = state.lines
        .slice(Math.max(0, state.lines.length - 120))
        .join('\n');
      const trunc = truncateTail(tail, {
        maxLines: Math.min(DEFAULT_MAX_LINES, 200),
        maxBytes: Math.min(DEFAULT_MAX_BYTES, 12 * 1024),
      });

      const text = trunc.content.trim();
      state.lastFailureText =
        text.length > 0 ? text : '(tests failing, but no output captured)';
      state.lastPassText = null;

      // Stable signature: ignore runtime-only differences (like "Time:")
      state.lastFailureId = buildFailureSignature(state.lines);

      state.lastFailureUpdatedAt = Date.now();
      state.lastStatusId = `fail:${state.lastFailureId}`;
      return;
    }
  }
}

function buildWidgetLines(state: WatchState): string[] {
  const running = state.proc
    ? 'running'
    : state.starting
      ? 'starting'
      : 'stopped';
  const status = getStatusLabel(state.lastStatusId);
  const updated = formatTimestamp(state.lastFailureUpdatedAt);

  const lines: string[] = [];
  lines.push(`test-watch: ${status} (${running})`);
  lines.push(
    `enabled: ${state.enabled} | debug: ${state.uiEnabled} (${state.uiPlacement}) | notify: ${state.notifyEnabled}`,
  );
  lines.push(
    `cmd: ${state.command}${state.commandOverride ? ' (override)' : ''}`,
  );
  lines.push(`last update: ${updated}`);

  if (status === 'FAIL' && state.lastFailureText) {
    lines.push(`failure: ${firstLine(state.lastFailureText)}`);
    lines.push('(use /testwatch to view full failing output)');
  } else if (status === 'PASS' && state.lastPassText) {
    lines.push(`summary: ${firstLine(state.lastPassText)}`);
  }

  return lines;
}

function updateUi(state: WatchState, ctx: any): void {
  if (!ctx?.hasUI) return;

  // Always show the footer status.
  const status = getStatusLabel(state.lastStatusId);
  const running = state.proc
    ? 'running'
    : state.starting
      ? 'starting'
      : 'stopped';
  ctx.ui.setStatus('test-watch', `tests: ${status} (${running})`);

  // Only show the multi-line widget when debug UI is enabled.
  if (!state.uiEnabled) {
    if (state.uiLastRenderHash !== null) {
      state.uiLastRenderHash = null;
      ctx.ui.setWidget('test-watch', undefined);
    }
    return;
  }

  const lines = buildWidgetLines(state);
  const hash = sha1(lines.join('\n'));
  if (hash !== state.uiLastRenderHash) {
    state.uiLastRenderHash = hash;
    if (state.uiPlacement === 'belowEditor') {
      ctx.ui.setWidget('test-watch', lines, { placement: 'belowEditor' });
    } else {
      ctx.ui.setWidget('test-watch', lines);
    }
  }
}

function stopUi(state: WatchState, ctx?: any): void {
  if (state.uiInterval) {
    clearInterval(state.uiInterval);
    state.uiInterval = null;
  }
  state.uiLastRenderHash = null;

  if (ctx?.hasUI) {
    ctx.ui.setStatus('test-watch', undefined);
    ctx.ui.setWidget('test-watch', undefined);
  }
}

function startUi(state: WatchState, ctx: any): void {
  if (!ctx?.hasUI) return;

  if (state.uiInterval) clearInterval(state.uiInterval);

  updateUi(state, ctx);

  // Keep the footer up to date even when the debug widget is hidden.
  state.uiInterval = setInterval(() => {
    try {
      if (!state.enabled) {
        stopUi(state, ctx);
        return;
      }
      updateUi(state, ctx);
    } catch {
      // ignore
    }
  }, 750);
}

function maybeInjectTestStatusMessage(
  pi: any,
  state: WatchState,
  statusId: string,
): void {
  // Only inject when the status changes.
  if (state.lastInjectedStatusId === statusId) return;
  state.lastInjectedStatusId = statusId;

  const when = formatTimestamp(state.lastFailureUpdatedAt);

  let header: string;
  let body: string;

  if (statusId === 'pass') {
    header = 'Background tests are PASSING (watch mode)';
    body = (state.lastPassText ?? 'PASS').trim();
  } else if (statusId.startsWith('fail:')) {
    header = 'Background tests are FAILING (watch mode)';
    if (!state.lastFailureText) return;
    const trunc = truncateTail(state.lastFailureText, {
      maxLines: 200,
      maxBytes: 14 * 1024,
    });
    body = trunc.content.trim();
  } else {
    return;
  }

  const text =
    `${header}\n` +
    `cmd: ${state.command}\n` +
    `cwd: ${state.cwd ?? '(unknown)'}\n` +
    `last update: ${when}\n\n` +
    body;

  try {
    pi.sendMessage(
      {
        customType: 'test-watch',
        content: text,
        display: true,
        details: {
          statusId,
          command: state.command,
          cwd: state.cwd,
          updatedAt: state.lastFailureUpdatedAt,
        },
      },
      { deliverAs: 'followUp', triggerTurn: false },
    );
  } catch {
    // ignore
  }
}

function stopWatcher(state: WatchState): void {
  if (!state.proc) return;

  try {
    state.proc.kill('SIGTERM');
  } catch {
    // ignore
  }

  state.proc = null;
  state.starting = false;
  state.watcherHasStatusCallback = false;
}

function startWatcher(
  state: WatchState,
  cwd: string,
  command: string,
  onStatusChange?: (statusId: string) => void,
): void {
  if (state.proc || state.starting) return;

  state.starting = true;
  state.cwd = cwd;
  state.command = command;

  const proc = spawn(command, {
    cwd,
    shell: true,
    env: {
      ...process.env,
      FORCE_COLOR: process.env.FORCE_COLOR ?? '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  state.proc = proc;
  state.starting = false;
  state.watcherHasStatusCallback = Boolean(onStatusChange);

  const onChunk = (chunk: Buffer) => {
    const prevStatusId = state.lastStatusId;

    const text = stripAnsi(chunk.toString('utf8'));
    const parts = splitLines(text);
    for (const line of parts) {
      if (line.length === 0) continue;
      state.lines.push(line);
    }

    if (state.lines.length > 5000) {
      state.lines.splice(0, state.lines.length - 5000);
    }

    updateFailureStateFromOutput(state);

    if (state.lastStatusId && state.lastStatusId !== prevStatusId) {
      onStatusChange?.(state.lastStatusId);
    }
  };

  proc.stdout?.on('data', onChunk);
  proc.stderr?.on('data', onChunk);

  proc.on('exit', () => {
    state.proc = null;
    state.starting = false;
    state.watcherHasStatusCallback = false;

    // Auto-restart if still enabled
    if (state.enabled) {
      const restartCwd = state.cwd;
      const restartCmd = state.command;
      if (restartCwd && restartCmd) {
        setTimeout(() => {
          if (state.enabled && !state.proc) {
            startWatcher(
              state,
              restartCwd,
              restartCmd,
              state.statusChangeHandler ?? undefined,
            );
          }
        }, 1000);
      }
    }
  });
}

function ensureWatcherAndUiRunning(pi: any, state: WatchState, ctx: any): void {
  if (!ctx?.hasUI) return;

  // If the extension code changed since the watcher started, restart once so new behavior takes effect.
  if (state.version !== EXTENSION_VERSION) {
    state.version = EXTENSION_VERSION;
    stopWatcher(state);
  }

  // When an extension is added via /reload, pi may not have parsed CLI flags for it.
  // Treat undefined as defaults.
  //
  // By default we only show the footer status. The multi-line widget is treated as a debug UI.
  const debugFlag =
    getBoolFlag(pi, '--test-watch-debug', false) ||
    getBoolFlag(pi, '--test-watch-ui', false);
  state.uiEnabled = state.uiOverride ?? debugFlag;

  // Only inject PASS/FAIL messages into the conversation when explicitly enabled.
  state.notifyEnabled =
    state.notifyOverride ?? getBoolFlag(pi, '--test-watch-notify', false);

  state.uiPlacement = normalizePlacement(
    getStringFlag(pi, '--test-watch-ui-placement', 'aboveEditor'),
  );

  const enabled = getBoolFlag(pi, '--test-watch', true);
  state.enabled = enabled;

  if (!enabled) {
    stopWatcher(state);
    stopUi(state, ctx);
    return;
  }

  // Allow changing the command at runtime via /testwatch (stored in-memory).
  if (
    typeof state.commandOverride === 'string' &&
    state.commandOverride.trim().length === 0
  ) {
    state.commandOverride = null;
  }

  // Migrate the old default command to the new default (unless the user explicitly overrides via /testwatch).
  const legacyDefaultCommand = 'npm run -s test:unit -- --watch';
  const configuredCommandRaw = getStringFlag(
    pi,
    '--test-watch-command',
    defaultWatchCommand(),
  );
  const configuredCommand =
    configuredCommandRaw === legacyDefaultCommand
      ? defaultWatchCommand()
      : configuredCommandRaw;

  const command = state.commandOverride ?? configuredCommand;

  // Notify handler used by the background watcher.
  state.statusChangeHandler = (statusId: string) => {
    if (state.notifyEnabled) {
      maybeInjectTestStatusMessage(pi, state, statusId);
    }
    updateUi(state, ctx);
  };

  // If we have a running watcher that predates status callbacks, restart once.
  if (state.proc && !state.watcherHasStatusCallback) {
    stopWatcher(state);
  }

  // If we changed cwd/command, restart.
  if (state.proc && (state.cwd !== ctx.cwd || state.command !== command)) {
    stopWatcher(state);
  }

  startWatcher(state, ctx.cwd, command, state.statusChangeHandler);

  // Always keep the footer status updated; the widget itself is controlled via the debug UI flag(s).
  startUi(state, ctx);
}

export default function testWatchExtension(pi: ExtensionAPI) {
  pi.registerFlag('test-watch', {
    description:
      'Run a background test runner in watch mode and report changes (PASS/FAIL) into the session',
    type: 'boolean',
    default: true,
  });

  pi.registerFlag('test-watch-command', {
    description:
      "Shell command to run for background watch (default: 'npm run -s test:watch'). " +
      "Examples: 'npm run -s test:watch', 'npm run -s test:unit -- --watch'",
    type: 'string',
    default: defaultWatchCommand(),
  });

  pi.registerFlag('test-watch-report', {
    description:
      "When to append failing output to tool results: 'changed' (default) or 'always'",
    type: 'string',
    default: 'changed',
  });

  pi.registerFlag('test-watch-debug', {
    description:
      'Show the detailed multi-line test-watch widget (debug mode). The footer status is shown regardless.',
    type: 'boolean',
    default: false,
  });

  // Backwards-compatible alias.
  pi.registerFlag('test-watch-ui', {
    description: '(deprecated) Alias for --test-watch-debug',
    type: 'boolean',
    default: false,
  });

  pi.registerFlag('test-watch-notify', {
    description:
      'Inject PASS/FAIL updates into the conversation when the status changes (default: false)',
    type: 'boolean',
    default: false,
  });

  pi.registerFlag('test-watch-ui-placement', {
    description:
      "Where to place the test-watch debug widget: 'aboveEditor' (default) or 'belowEditor'",
    type: 'string',
    default: 'aboveEditor',
  });

  // Start watcher/UI when session starts.
  // Note: after /reload, session_start may NOT fire; see agent_start below.
  pi.on('session_start', async (_event: any, ctx: any) => {
    const state = getState();
    if (!ctx.hasUI) return;
    ensureWatcherAndUiRunning(pi, state, ctx);
  });

  // Ensure watcher/UI after /reload (next time the agent runs).
  pi.on('agent_start', async (_event: any, ctx: any) => {
    const state = getState();
    if (!ctx.hasUI) return;
    ensureWatcherAndUiRunning(pi, state, ctx);
  });

  pi.on('session_shutdown', async (_event: any, ctx: any) => {
    const state = getState();
    state.enabled = false;
    stopWatcher(state);
    stopUi(state, ctx);
  });

  // Manual status dialog
  pi.registerCommand('testwatch', {
    description: 'Show test watcher status (and restart it if needed)',
    handler: async (args: any, ctx: any) => {
      const state = getState();
      if (!ctx.hasUI) return;

      // Fast path:
      //   /testwatch <command>
      //   /testwatch reset
      //   /testwatch debug on|off|reset
      //   /testwatch notify on|off|reset
      const argText = typeof args === 'string' ? args.trim() : '';
      if (argText) {
        const parts = argText.split(/\s+/g);
        const head = (parts[0] ?? '').toLowerCase();
        const tail = (parts[1] ?? '').toLowerCase();

        if (head === 'debug') {
          if (tail === 'on' || tail === 'true') state.uiOverride = true;
          else if (tail === 'off' || tail === 'false') state.uiOverride = false;
          else if (tail === 'reset' || tail === 'default')
            state.uiOverride = null;
          else {
            ctx.ui.notify('Usage: /testwatch debug on|off|reset', 'info');
            return;
          }
          ensureWatcherAndUiRunning(pi, state, ctx);
          ctx.ui.notify(
            `test-watch: debug widget ${state.uiOverride === null ? 'reset (flags/defaults)' : state.uiOverride ? 'enabled' : 'disabled'}`,
            'info',
          );
          return;
        }

        if (head === 'notify') {
          if (tail === 'on' || tail === 'true') state.notifyOverride = true;
          else if (tail === 'off' || tail === 'false')
            state.notifyOverride = false;
          else if (tail === 'reset' || tail === 'default')
            state.notifyOverride = null;
          else {
            ctx.ui.notify('Usage: /testwatch notify on|off|reset', 'info');
            return;
          }
          ensureWatcherAndUiRunning(pi, state, ctx);
          ctx.ui.notify(
            `test-watch: notifications ${state.notifyOverride === null ? 'reset (flags/defaults)' : state.notifyOverride ? 'enabled' : 'disabled'}`,
            'info',
          );
          return;
        }

        if (argText === 'reset' || argText === 'default') {
          state.commandOverride = null;
          stopWatcher(state);
          ensureWatcherAndUiRunning(pi, state, ctx);
          ctx.ui.notify('test-watch: command reset to default', 'info');
          return;
        }

        // Anything else is treated as a command override.
        state.commandOverride = argText;
        stopWatcher(state);
        ensureWatcherAndUiRunning(pi, state, ctx);
        ctx.ui.notify(`test-watch: command set to: ${argText}`, 'info');
        return;
      }

      ensureWatcherAndUiRunning(pi, state, ctx);

      const enabled = getBoolFlag(pi, '--test-watch', true);

      const legacyDefaultCommand = 'npm run -s test:unit -- --watch';
      const configuredCommandRaw = getStringFlag(
        pi,
        '--test-watch-command',
        defaultWatchCommand(),
      );
      const configuredCommand =
        configuredCommandRaw === legacyDefaultCommand
          ? defaultWatchCommand()
          : configuredCommandRaw;

      const effectiveCommand = state.commandOverride ?? configuredCommand;

      const statusLines: string[] = [];
      statusLines.push(`enabled: ${enabled}`);
      statusLines.push(
        `command: ${effectiveCommand}${state.commandOverride ? ' (override)' : ''}`,
      );
      statusLines.push(
        `debug widget: ${state.uiEnabled}${state.uiOverride === null ? '' : ' (override)'} | notifications: ${state.notifyEnabled}${state.notifyOverride === null ? '' : ' (override)'}`,
      );
      statusLines.push(`running: ${Boolean(state.proc)}`);
      statusLines.push(`status: ${getStatusLabel(state.lastStatusId)}`);

      if (state.lastStatusId?.startsWith('fail:') && state.lastFailureText) {
        statusLines.push(
          `last failure updated: ${formatTimestamp(state.lastFailureUpdatedAt)}`,
        );
      } else if (state.lastStatusId === 'pass') {
        statusLines.push(
          `last pass updated: ${formatTimestamp(state.lastFailureUpdatedAt)}`,
        );
      } else {
        statusLines.push('last result: passing (or not detected yet)');
      }

      const toggleDebugLabel = state.uiEnabled
        ? 'Hide debug widget'
        : 'Show debug widget';
      const toggleNotifyLabel = state.notifyEnabled
        ? 'Disable notifications'
        : 'Enable notifications';

      const choice = await ctx.ui.select('Test Watch', [
        'OK',
        'Change command',
        state.commandOverride ? 'Reset command' : '(command from flags)',
        'Restart watcher',
        toggleDebugLabel,
        toggleNotifyLabel,
        state.lastFailureText
          ? 'Show last failing output'
          : '(no failing output)',
        state.lastPassText ? 'Show last pass summary' : '(no pass summary)',
      ]);

      if (choice === 'Change command') {
        const next = await ctx.ui.input('Test watch command', effectiveCommand);
        if (typeof next === 'string') {
          const trimmed = next.trim();
          if (trimmed.length > 0) {
            state.commandOverride = trimmed;
            stopWatcher(state);
            ensureWatcherAndUiRunning(pi, state, ctx);
            ctx.ui.notify(`test-watch: command set to: ${trimmed}`, 'info');
          }
        }
      }

      if (choice === 'Reset command') {
        state.commandOverride = null;
        stopWatcher(state);
        ensureWatcherAndUiRunning(pi, state, ctx);
        ctx.ui.notify('test-watch: command reset to default', 'info');
      }

      if (choice === toggleDebugLabel) {
        state.uiOverride = !state.uiEnabled;
        ensureWatcherAndUiRunning(pi, state, ctx);
        ctx.ui.notify(
          `test-watch: debug widget ${state.uiOverride ? 'enabled' : 'disabled'}`,
          'info',
        );
      }

      if (choice === toggleNotifyLabel) {
        state.notifyOverride = !state.notifyEnabled;
        ensureWatcherAndUiRunning(pi, state, ctx);
        ctx.ui.notify(
          `test-watch: notifications ${state.notifyOverride ? 'enabled' : 'disabled'}`,
          'info',
        );
      }

      if (choice === 'Restart watcher') {
        stopWatcher(state);
        if (enabled) ensureWatcherAndUiRunning(pi, state, ctx);
        ctx.ui.notify(
          state.proc ? 'Test watcher restarted' : 'Test watcher stopped',
          'info',
        );
      }

      if (choice === 'Show last failing output' && state.lastFailureText) {
        await ctx.ui.editor('Last failing output', state.lastFailureText);
      }

      if (choice === 'Show last pass summary' && state.lastPassText) {
        await ctx.ui.editor('Last pass summary', state.lastPassText);
      }

      ctx.ui.notify(statusLines.join(' | '), 'info');
    },
  });

  // At the end of every tool call, append failing output ONLY if the watcher status changed.
  pi.on('tool_result', async (event: any, _ctx: any) => {
    const state = getState();

    const enabled = getBoolFlag(pi, '--test-watch', true);
    if (!enabled) return;

    const reportMode = getStringFlag(
      pi,
      '--test-watch-report',
      'changed',
    ) as ReportMode;
    if (reportMode !== 'always' && reportMode !== 'changed') return;

    const statusId = state.lastStatusId;
    if (!statusId) return;

    if (reportMode === 'changed' && state.lastReportedStatusId === statusId)
      return;
    state.lastReportedStatusId = statusId;

    // Only append when failing (pass updates are injected via sendMessage)
    if (!statusId.startsWith('fail:') || !state.lastFailureText) return;

    const when = formatTimestamp(state.lastFailureUpdatedAt);
    const header = `\n\n[Background tests failing (watch mode). Last update: ${when}]\n`;

    const trunc = truncateTail(state.lastFailureText, {
      maxLines: 120,
      maxBytes: 10 * 1024,
    });

    return {
      content: [
        ...event.content,
        { type: 'text', text: header + trunc.content },
      ],
      details: event.details,
      isError: event.isError,
    };
  });
}
