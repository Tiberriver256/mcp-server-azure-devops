import type { ToolsetName } from './tool-filter';
import {
  normalizeToolsetName,
  parseBooleanOption,
  parseCliToolFilterArgs,
  parseCsvList,
  resolveEnabledTools,
  TOOLSET_NAMES,
} from './tool-filter';
import type { ToolDefinition } from '../types/tool-definition';
import { AzureDevOpsValidationError } from '../errors';

function makeTool(name: string, readOnly?: boolean): ToolDefinition {
  return {
    name,
    description: `${name} description`,
    inputSchema: { type: 'object', properties: {} },
    ...(readOnly !== undefined ? { readOnly } : {}),
  };
}

function makeRegistry(): Record<ToolsetName, ToolDefinition[]> {
  return {
    users: [makeTool('get_me', true)],
    organizations: [makeTool('list_organizations', true)],
    projects: [makeTool('list_projects', true), makeTool('get_project', true)],
    repositories: [
      makeTool('list_repositories', true),
      makeTool('create_commit', false),
    ],
    'work-items': [
      makeTool('get_work_item', true),
      makeTool('create_work_item', false),
      makeTool('unmarked_write_tool'), // intentionally omits readOnly (fail-closed)
    ],
    search: [makeTool('search_code', true)],
    'pull-requests': [
      makeTool('list_pull_requests', true),
      makeTool('create_pull_request', false),
    ],
    pipelines: [
      makeTool('list_pipelines', true),
      makeTool('trigger_pipeline', false),
    ],
    wikis: [makeTool('get_wikis', true), makeTool('create_wiki_page', false)],
    'test-plans': [
      makeTool('list_test_plans', true),
      makeTool('create_test_plan', false),
    ],
  };
}

describe('tool-filter', () => {
  describe('parseCsvList', () => {
    it('returns undefined for undefined or blank strings', () => {
      expect(parseCsvList(undefined)).toBeUndefined();
      expect(parseCsvList('')).toBeUndefined();
      expect(parseCsvList(' , , ')).toBeUndefined();
    });

    it('trims, skips empties, and deduplicates values', () => {
      expect(parseCsvList(' projects, work-items , projects, ')).toEqual([
        'projects',
        'work-items',
      ]);
    });
  });

  describe('parseBooleanOption', () => {
    it('parses truthy and falsy values case-insensitively', () => {
      for (const v of ['true', 'TRUE', '1', 'yes', 'on']) {
        expect(parseBooleanOption(v)).toBe(true);
      }
      for (const v of ['false', 'FALSE', '0', 'no', 'off']) {
        expect(parseBooleanOption(v)).toBe(false);
      }
      expect(parseBooleanOption(undefined)).toBeUndefined();
      expect(parseBooleanOption('   ')).toBeUndefined();
    });

    it('throws AzureDevOpsValidationError on invalid boolean', () => {
      expect(() =>
        parseBooleanOption('maybe', 'AZURE_DEVOPS_READ_ONLY'),
      ).toThrow(AzureDevOpsValidationError);
    });
  });

  describe('parseCliToolFilterArgs', () => {
    it('parses space-separated and equals-separated flags', () => {
      expect(
        parseCliToolFilterArgs([
          '--toolsets',
          'projects,work-items',
          '--enabled-tools=get_project,get_work_item',
          '--disabled-tools',
          'create_work_item',
          '--read-only',
        ]),
      ).toEqual({
        toolsets: ['projects', 'work-items'],
        enabledTools: ['get_project', 'get_work_item'],
        disabledTools: ['create_work_item'],
        readOnly: true,
      });
    });

    it('parses explicit --read-only=false and --read-only false', () => {
      expect(parseCliToolFilterArgs(['--read-only=false'])).toEqual({
        readOnly: false,
      });
      expect(parseCliToolFilterArgs(['--read-only', 'false'])).toEqual({
        readOnly: false,
      });
    });

    it('throws on missing, empty, comma-only, or invalid flag values and unknown flags', () => {
      for (const badArgs of [
        ['--toolsets'],
        ['--toolsets', '--read-only'],
        ['--toolsets', ''],
        ['--toolsets', ' , , '],
        ['--toolsets='],
        ['--toolsets=,,,'],
        ['--enabled-tools=,'],
        ['--disabled-tools='],
        ['--read-only='],
        ['--read-only=   '],
        ['--read-only', ''],
        ['--read-only', '   '],
        ['--read-only', 'invalid'],
        ['--read-only=flase'],
        ['--readonly'],
        ['--toolset', 'projects'],
        ['positional'],
      ]) {
        expect(() => parseCliToolFilterArgs(badArgs)).toThrow(
          AzureDevOpsValidationError,
        );
      }
    });
  });

  describe('normalizeToolsetName', () => {
    it('normalizes canonical names, underscores, and common aliases', () => {
      expect(normalizeToolsetName('ALL')).toBe('all');
      expect(normalizeToolsetName('work_items')).toBe('work-items');
      expect(normalizeToolsetName('workitems')).toBe('work-items');
      expect(normalizeToolsetName('pull_requests')).toBe('pull-requests');
      expect(normalizeToolsetName('prs')).toBe('pull-requests');
      expect(normalizeToolsetName('repos')).toBe('repositories');
      expect(normalizeToolsetName('test_plans')).toBe('test-plans');
      expect(normalizeToolsetName('testplans')).toBe('test-plans');
      for (const name of TOOLSET_NAMES) {
        expect(normalizeToolsetName(name)).toBe(name);
      }
    });

    it('throws AzureDevOpsValidationError for unknown toolsets', () => {
      expect(() => normalizeToolsetName('nonexistent')).toThrow(
        AzureDevOpsValidationError,
      );
    });
  });

  describe('resolveEnabledTools', () => {
    it('enables all tools by default', () => {
      const registry = makeRegistry();
      const result = resolveEnabledTools(registry);
      expect(result.tools.length).toBe(result.allToolNames.size);
      expect(result.readOnlyBlockedNames.size).toBe(0);
    });

    it('filters by toolsets (including aliases and all)', () => {
      const registry = makeRegistry();
      const subset = resolveEnabledTools(registry, {
        toolsets: ['projects', 'prs'],
      });
      expect(subset.tools.map((t) => t.name)).toEqual([
        'list_projects',
        'get_project',
        'list_pull_requests',
        'create_pull_request',
      ]);

      const all = resolveEnabledTools(registry, { toolsets: ['all'] });
      expect(all.tools.length).toBe(all.allToolNames.size);
    });

    it('filters by enabledTools and intersects with toolsets', () => {
      const registry = makeRegistry();
      const result = resolveEnabledTools(registry, {
        toolsets: ['projects', 'work-items'],
        enabledTools: ['get_project', 'get_work_item', 'list_pipelines'],
      });
      expect(result.tools.map((t) => t.name)).toEqual([
        'get_project',
        'get_work_item',
      ]);
    });

    it('throws on unknown tool in enabledTools', () => {
      expect(() =>
        resolveEnabledTools(makeRegistry(), {
          enabledTools: ['does_not_exist'],
        }),
      ).toThrow(AzureDevOpsValidationError);
    });

    it('removes disabledTools and warns on unknown disabled tool names', () => {
      const originalStderr = process.stderr.write;
      const stderrMock = jest.fn();
      process.stderr.write =
        stderrMock as unknown as typeof process.stderr.write;

      try {
        const result = resolveEnabledTools(makeRegistry(), {
          toolsets: ['projects'],
          disabledTools: ['get_project', 'unknown_legacy_tool'],
        });
        expect(result.tools.map((t) => t.name)).toEqual(['list_projects']);
        expect(stderrMock).toHaveBeenCalledWith(
          expect.stringContaining('unknown_legacy_tool'),
        );
      } finally {
        process.stderr.write = originalStderr;
      }
    });

    it('enforces fail-closed read-only mode even when write tools are in enabledTools', () => {
      const result = resolveEnabledTools(makeRegistry(), {
        enabledTools: [
          'get_work_item',
          'create_work_item',
          'unmarked_write_tool',
        ],
        readOnly: true,
      });

      expect(result.tools.map((t) => t.name)).toEqual(['get_work_item']);
      expect(result.readOnlyBlockedNames.has('create_work_item')).toBe(true);
      expect(result.readOnlyBlockedNames.has('unmarked_write_tool')).toBe(true);
    });
  });
});
