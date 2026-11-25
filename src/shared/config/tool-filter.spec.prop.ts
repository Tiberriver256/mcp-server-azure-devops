import fc from 'fast-check';
import { AzureDevOpsValidationError } from '../errors';
import {
  normalizeToolsetName,
  parseCliToolFilterArgs,
  resolveEnabledTools,
  TOOLSET_NAMES,
} from './tool-filter';
import type { ToolLike, ToolsetName } from './tool-filter';

const sampleRegistry: Record<ToolsetName, readonly ToolLike[]> = {
  users: [{ name: 'u_read', readOnly: true }],
  organizations: [{ name: 'o_read', readOnly: true }],
  projects: [
    { name: 'p_read', readOnly: true },
    { name: 'p_unknown' }, // missing readOnly must fail closed
  ],
  repositories: [
    { name: 'r_read', readOnly: true },
    { name: 'r_write', readOnly: false },
  ],
  'work-items': [
    { name: 'w_read', readOnly: true },
    { name: 'w_write', readOnly: false },
  ],
  search: [{ name: 's_read', readOnly: true }],
  'pull-requests': [
    { name: 'pr_read', readOnly: true },
    { name: 'pr_write', readOnly: false },
  ],
  pipelines: [
    { name: 'pl_read', readOnly: true },
    { name: 'pl_write', readOnly: false },
  ],
  wikis: [
    { name: 'wk_read', readOnly: true },
    { name: 'wk_write', readOnly: false },
  ],
  'test-plans': [
    { name: 'tp_read', readOnly: true },
    { name: 'tp_write', readOnly: false },
  ],
};

const ALL_TOOL_NAMES = TOOLSET_NAMES.flatMap((ts) =>
  sampleRegistry[ts].map((t) => t.name),
);
const TOOLSET_INDEX = new Map<string, number>();
TOOLSET_NAMES.forEach((ts, idx) => {
  for (const t of sampleRegistry[ts]) {
    TOOLSET_INDEX.set(t.name, idx);
  }
});

const toolsetSubsetArb = fc.option(
  fc.subarray([...TOOLSET_NAMES], { minLength: 1 }),
  { nil: undefined },
);
const toolNameSubsetArb = fc.option(
  fc.subarray(ALL_TOOL_NAMES, { minLength: 1 }),
  { nil: undefined },
);

describe('tool-filter properties', () => {
  it('SECURITY INVARIANT: readOnly=true is strictly fail-closed regardless of toolsets/enabledTools/disabledTools', () => {
    fc.assert(
      fc.property(
        toolsetSubsetArb,
        toolNameSubsetArb,
        toolNameSubsetArb,
        (toolsets, enabledTools, disabledTools) => {
          const catalog = resolveEnabledTools(sampleRegistry, {
            toolsets,
            enabledTools,
            disabledTools,
            readOnly: true,
          });

          // Every surviving tool MUST explicitly declare readOnly === true
          for (const tool of catalog.tools) {
            expect(tool.readOnly).toBe(true);
          }

          // No overlap between enabled and readOnlyBlocked sets
          for (const name of catalog.enabledToolNames) {
            expect(catalog.readOnlyBlockedNames.has(name)).toBe(false);
          }

          // Unknown-readOnly tool ('p_unknown') is NEVER admitted in read-only mode
          expect(catalog.enabledToolNames.has('p_unknown')).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('Set algebra & monotonicity laws: disabledTools always removes, enabledTools is a subset, canonical order is preserved', () => {
    fc.assert(
      fc.property(
        toolsetSubsetArb,
        toolNameSubsetArb,
        toolNameSubsetArb,
        fc.boolean(),
        (toolsets, enabledTools, disabledTools, readOnly) => {
          const catalog = resolveEnabledTools(sampleRegistry, {
            toolsets,
            enabledTools,
            disabledTools,
            readOnly,
          });

          // disabledTools are never present
          for (const blocked of disabledTools ?? []) {
            expect(catalog.enabledToolNames.has(blocked)).toBe(false);
          }

          // If enabledTools is specified, every resulting tool is in enabledTools
          if (enabledTools) {
            const allowed = new Set(enabledTools);
            for (const name of catalog.enabledToolNames) {
              expect(allowed.has(name)).toBe(true);
            }
          }

          // Monotonicity: enabling readOnly can only shrink or keep the enabled set
          const fullCatalog = resolveEnabledTools(sampleRegistry, {
            toolsets,
            enabledTools,
            disabledTools,
            readOnly: false,
          });
          for (const name of catalog.enabledToolNames) {
            expect(fullCatalog.enabledToolNames.has(name)).toBe(true);
          }

          // Canonical TOOLSET_NAMES ordering is always preserved
          let prevIdx = -1;
          for (const tool of catalog.tools) {
            const idx = TOOLSET_INDEX.get(tool.name) ?? -1;
            expect(idx).toBeGreaterThanOrEqual(prevIdx);
            prevIdx = idx;
          }

          // No duplicate tool names
          expect(catalog.enabledToolNames.size).toBe(catalog.tools.length);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('CLI flag equivalence: `--flag value` and `--flag=value` produce identical parsed options', () => {
    fc.assert(
      fc.property(
        fc.subarray([...TOOLSET_NAMES], { minLength: 1 }),
        fc.subarray(ALL_TOOL_NAMES, { minLength: 1 }),
        fc.subarray(ALL_TOOL_NAMES, { minLength: 1 }),
        fc.boolean(),
        (toolsets, enabled, disabled, readOnly) => {
          const spaceArgs = [
            '--toolsets',
            toolsets.join(','),
            '--enabled-tools',
            enabled.join(','),
            '--disabled-tools',
            disabled.join(','),
            '--read-only',
            String(readOnly),
          ];
          const equalsArgs = [
            `--toolsets=${toolsets.join(',')}`,
            `--enabled-tools=${enabled.join(',')}`,
            `--disabled-tools=${disabled.join(',')}`,
            `--read-only=${String(readOnly)}`,
          ];

          expect(parseCliToolFilterArgs(spaceArgs)).toEqual(
            parseCliToolFilterArgs(equalsArgs),
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it('SECURITY INVARIANT: Object.prototype property names are rejected as unknown toolsets', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          'toString',
          'constructor',
          '__proto__',
          'valueOf',
          'hasOwnProperty',
          'isPrototypeOf',
          'toLocaleString',
        ),
        (protoKey) => {
          expect(() => normalizeToolsetName(protoKey)).toThrow(
            AzureDevOpsValidationError,
          );
          expect(() =>
            resolveEnabledTools(sampleRegistry, { toolsets: [protoKey] }),
          ).toThrow(AzureDevOpsValidationError);
        },
      ),
      { numRuns: 50 },
    );
  });
});
