import { parseArgs } from 'util';
import fc from 'fast-check';
import {
  parseCliToolFilterArgs,
  resolveEnabledTools,
  TOOLSET_NAMES,
} from './tool-filter';
import type { ToolFilterOptions, ToolLike, ToolsetName } from './tool-filter';

const registry: Record<ToolsetName, readonly ToolLike[]> = {
  users: [{ name: 'get_me', readOnly: true }],
  organizations: [{ name: 'list_organizations', readOnly: true }],
  projects: [
    { name: 'list_projects', readOnly: true },
    { name: 'get_project', readOnly: true },
  ],
  repositories: [
    { name: 'list_repositories', readOnly: true },
    { name: 'create_commit', readOnly: false },
  ],
  'work-items': [
    { name: 'get_work_item', readOnly: true },
    { name: 'create_work_item', readOnly: false },
  ],
  search: [{ name: 'search_code', readOnly: true }],
  'pull-requests': [
    { name: 'list_pull_requests', readOnly: true },
    { name: 'merge_pull_request', readOnly: false },
  ],
  pipelines: [
    { name: 'list_pipelines', readOnly: true },
    { name: 'trigger_pipeline', readOnly: false },
  ],
  wikis: [
    { name: 'get_wikis', readOnly: true },
    { name: 'create_wiki', readOnly: false },
  ],
  'test-plans': [
    { name: 'list_test_plans', readOnly: true },
    { name: 'create_test_plan', readOnly: false },
  ],
};

const ALL_NAMES = TOOLSET_NAMES.flatMap((ts) =>
  registry[ts].map((t) => t.name),
);

const ORACLE_ALIASES = new Map<string, string>([
  ['repos', 'repositories'],
  ['prs', 'pull-requests'],
  ['pull_requests', 'pull-requests'],
  ['pullrequests', 'pull-requests'],
  ['work_items', 'work-items'],
  ['workitems', 'work-items'],
  ['test_plans', 'test-plans'],
  ['testplans', 'test-plans'],
]);

function oracleNormalizeToolset(raw: string): string {
  const key = raw.trim().toLowerCase();
  if (key === 'all') {
    return 'all';
  }
  return ORACLE_ALIASES.get(key) ?? key;
}

function oracleParseCsv(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
  );
}

function oracleParseBool(raw: string): boolean {
  const normalized = raw.trim().toLowerCase();
  if (
    normalized === 'true' ||
    normalized === '1' ||
    normalized === 'yes' ||
    normalized === 'on'
  ) {
    return true;
  }
  if (
    normalized === 'false' ||
    normalized === '0' ||
    normalized === 'no' ||
    normalized === 'off'
  ) {
    return false;
  }
  throw new Error(`Invalid boolean: ${raw}`);
}

/**
 * Independent brute-force per-tool set-algebra oracle (shares no parser/normalizer code with SUT).
 */
function oracleResolveEnabledToolNames(options: ToolFilterOptions): string[] {
  const normalizedToolsets =
    options.toolsets && options.toolsets.length > 0
      ? options.toolsets.map(oracleNormalizeToolset)
      : ['all'];
  const includeAll = normalizedToolsets.includes('all');
  const allowedToolsets = new Set<string>(normalizedToolsets);
  const allowSet =
    options.enabledTools && options.enabledTools.length > 0
      ? new Set(options.enabledTools.map((t) => t.trim()))
      : null;
  const denySet = new Set((options.disabledTools ?? []).map((t) => t.trim()));

  const result: string[] = [];
  for (const ts of TOOLSET_NAMES) {
    if (!includeAll && !allowedToolsets.has(ts)) {
      continue;
    }
    for (const tool of registry[ts]) {
      if (allowSet && !allowSet.has(tool.name)) {
        continue;
      }
      if (denySet.has(tool.name)) {
        continue;
      }
      if (options.readOnly && tool.readOnly !== true) {
        continue;
      }
      result.push(tool.name);
    }
  }
  return result;
}

/**
 * Independent CLI parser oracle built on Node.js native `util.parseArgs`.
 */
function oracleParseCliWithUtilParseArgs(argv: string[]): ToolFilterOptions {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    options: {
      toolsets: { type: 'string' },
      'enabled-tools': { type: 'string' },
      'disabled-tools': { type: 'string' },
      'read-only': { type: 'string' },
    },
  });

  const out: ToolFilterOptions = {};
  if (typeof values.toolsets === 'string') {
    out.toolsets = oracleParseCsv(values.toolsets);
  }
  if (typeof values['enabled-tools'] === 'string') {
    out.enabledTools = oracleParseCsv(values['enabled-tools']);
  }
  if (typeof values['disabled-tools'] === 'string') {
    out.disabledTools = oracleParseCsv(values['disabled-tools']);
  }
  if (typeof values['read-only'] === 'string') {
    out.readOnly = oracleParseBool(values['read-only']);
  }
  return out;
}

describe('tool-filter differential tests vs set-algebra & util.parseArgs oracles', () => {
  it('resolveEnabledTools agrees with independent brute-force set-algebra oracle on all filter combinations', () => {
    const aliasOrNameArb = fc.constantFrom(
      ...TOOLSET_NAMES,
      'all',
      'repos',
      'prs',
      'work_items',
      'testplans',
    );

    fc.assert(
      fc.property(
        fc.option(fc.array(aliasOrNameArb, { minLength: 1, maxLength: 4 }), {
          nil: undefined,
        }),
        fc.option(fc.subarray(ALL_NAMES, { minLength: 1 }), { nil: undefined }),
        fc.option(fc.subarray(ALL_NAMES, { minLength: 1 }), { nil: undefined }),
        fc.boolean(),
        (toolsets, enabledTools, disabledTools, readOnly) => {
          const opts: ToolFilterOptions = {
            toolsets,
            enabledTools,
            disabledTools,
            readOnly,
          };
          const actual = resolveEnabledTools(registry, opts).tools.map(
            (t) => t.name,
          );
          const expected = oracleResolveEnabledToolNames(opts);
          expect(actual).toEqual(expected);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('parseCliToolFilterArgs agrees with Node util.parseArgs oracle across randomized flag orderings and formats', () => {
    const flagSpecArb = fc.record({
      toolsets: fc.option(
        fc.array(fc.constantFrom(...TOOLSET_NAMES), {
          minLength: 1,
          maxLength: 5,
        }),
        { nil: undefined },
      ),
      enabled: fc.option(
        fc.array(fc.constantFrom(...ALL_NAMES), { minLength: 1, maxLength: 5 }),
        { nil: undefined },
      ),
      disabled: fc.option(
        fc.array(fc.constantFrom(...ALL_NAMES), { minLength: 1, maxLength: 5 }),
        { nil: undefined },
      ),
      readOnly: fc.option(
        fc.constantFrom('true', 'false', '1', '0', 'yes', 'no', 'on', 'off'),
        { nil: undefined },
      ),
      useEquals: fc.boolean(),
    });

    fc.assert(
      fc.property(flagSpecArb, (spec) => {
        const argv: string[] = [];
        const pushFlag = (name: string, val: string) => {
          if (spec.useEquals) {
            argv.push(`${name}=${val}`);
          } else {
            argv.push(name, val);
          }
        };

        if (spec.toolsets) {
          pushFlag('--toolsets', spec.toolsets.join(','));
        }
        if (spec.enabled) {
          pushFlag('--enabled-tools', spec.enabled.join(','));
        }
        if (spec.disabled) {
          pushFlag('--disabled-tools', spec.disabled.join(','));
        }
        if (spec.readOnly) {
          pushFlag('--read-only', spec.readOnly);
        }

        expect(parseCliToolFilterArgs(argv)).toEqual(
          oracleParseCliWithUtilParseArgs(argv),
        );
      }),
      { numRuns: 150 },
    );
  });
});
