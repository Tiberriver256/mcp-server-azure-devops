import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { getConfig } from '../../index.ts';
import type { ToolLike, ToolsetName } from './tool-filter.ts';
import {
  expandToolsetNames,
  normalizeToolsetName,
  parseBooleanOption,
  parseCliToolFilterArgs,
  parseCsvList,
  resolveEnabledTools,
  TOOLSET_NAMES,
  TOOLSET_PRESET_NAMES,
  TOOLSET_PRESETS,
} from './tool-filter.ts';
import { AzureDevOpsValidationError } from '../errors/index.ts';

function makeTool(name: string, readOnly?: boolean): ToolLike {
  return {
    name,
    ...(readOnly !== undefined ? { readOnly } : {}),
  };
}

function makeRegistry(): Record<ToolsetName, ToolLike[]> {
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

void describe('tool-filter', () => {
  void describe('parseCsvList', () => {
    void it('returns undefined for undefined or blank strings', () => {
      assert.strictEqual(parseCsvList(undefined), undefined);
      assert.strictEqual(parseCsvList(''), undefined);
      assert.strictEqual(parseCsvList(' , , '), undefined);
    });

    void it('trims, skips empties, and deduplicates values', () => {
      assert.deepStrictEqual(
        parseCsvList(' projects, work-items , projects, '),
        ['projects', 'work-items'],
      );
    });
  });

  void describe('parseBooleanOption', () => {
    void it('parses truthy and falsy values case-insensitively', () => {
      for (const v of ['true', 'TRUE', '1', 'yes', 'on']) {
        assert.strictEqual(parseBooleanOption(v), true);
      }
      for (const v of ['false', 'FALSE', '0', 'no', 'off']) {
        assert.strictEqual(parseBooleanOption(v), false);
      }
      assert.strictEqual(parseBooleanOption(undefined), undefined);
      assert.strictEqual(parseBooleanOption('   '), undefined);
    });

    void it('throws AzureDevOpsValidationError on invalid boolean', () => {
      assert.throws(
        () => parseBooleanOption('maybe', 'AZURE_DEVOPS_READ_ONLY'),
        AzureDevOpsValidationError,
      );
    });
  });

  void describe('parseCliToolFilterArgs', () => {
    void it('parses space-separated and equals-separated flags', () => {
      assert.deepStrictEqual(
        parseCliToolFilterArgs([
          '--toolsets',
          'projects,work-items',
          '--enabled-tools=get_project,get_work_item',
          '--disabled-tools',
          'create_work_item',
          '--read-only',
        ]),
        {
          toolsets: ['projects', 'work-items'],
          enabledTools: ['get_project', 'get_work_item'],
          disabledTools: ['create_work_item'],
          readOnly: true,
        },
      );
    });

    void it('parses explicit --read-only=false and --read-only false', () => {
      assert.deepStrictEqual(parseCliToolFilterArgs(['--read-only=false']), {
        readOnly: false,
      });
      assert.deepStrictEqual(parseCliToolFilterArgs(['--read-only', 'false']), {
        readOnly: false,
      });
    });

    void it('parses --no-spotlighting and --spotlighting flags', () => {
      assert.deepStrictEqual(parseCliToolFilterArgs(['--no-spotlighting']), {
        spotlighting: false,
      });
      assert.deepStrictEqual(parseCliToolFilterArgs(['--spotlighting']), {
        spotlighting: true,
      });
      assert.deepStrictEqual(parseCliToolFilterArgs(['--spotlighting=true']), {
        spotlighting: true,
      });
      assert.deepStrictEqual(parseCliToolFilterArgs(['--spotlighting=false']), {
        spotlighting: false,
      });
      assert.deepStrictEqual(
        parseCliToolFilterArgs(['--spotlighting', 'true']),
        {
          spotlighting: true,
        },
      );
      assert.deepStrictEqual(
        parseCliToolFilterArgs(['--spotlighting', 'false']),
        {
          spotlighting: false,
        },
      );
      assert.deepStrictEqual(
        parseCliToolFilterArgs(['--spotlighting', '--read-only']),
        {
          spotlighting: true,
          readOnly: true,
        },
      );
      assert.deepStrictEqual(
        parseCliToolFilterArgs(['--no-spotlighting', '--spotlighting']),
        {
          spotlighting: true,
        },
      );
      assert.deepStrictEqual(
        parseCliToolFilterArgs(['--spotlighting', '--no-spotlighting']),
        {
          spotlighting: false,
        },
      );
    });

    void it('throws on missing, empty, comma-only, or invalid flag values and unknown flags', () => {
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
        ['--spotlighting='],
        ['--spotlighting=   '],
        ['--spotlighting', ''],
        ['--spotlighting', '   '],
        ['--spotlighting', 'maybe'],
        ['--spotlighting=maybe'],
        ['--no-spotlighting=true'],
        ['--no-spotlighting=false'],
        ['--no-spotlighting='],
        ['--no-spotlighting', 'false'],
        ['--readonly'],
        ['--toolset', 'projects'],
        ['positional'],
      ]) {
        assert.throws(
          () => parseCliToolFilterArgs(badArgs),
          AzureDevOpsValidationError,
        );
      }

      assert.throws(
        () => parseCliToolFilterArgs(['--unknown']),
        (err: unknown) => {
          assert.ok(err instanceof AzureDevOpsValidationError);
          assert.match(err.message, /--spotlighting/);
          assert.match(err.message, /--no-spotlighting/);
          return true;
        },
      );
    });
  });

  void describe('normalizeToolsetName', () => {
    void it('normalizes canonical names, underscores, and common aliases', () => {
      assert.strictEqual(normalizeToolsetName('ALL'), 'all');
      assert.strictEqual(normalizeToolsetName('work_items'), 'work-items');
      assert.strictEqual(normalizeToolsetName('workitems'), 'work-items');
      assert.strictEqual(
        normalizeToolsetName('pull_requests'),
        'pull-requests',
      );
      assert.strictEqual(normalizeToolsetName('prs'), 'pull-requests');
      assert.strictEqual(normalizeToolsetName('repos'), 'repositories');
      assert.strictEqual(normalizeToolsetName('test_plans'), 'test-plans');
      assert.strictEqual(normalizeToolsetName('testplans'), 'test-plans');
      for (const name of TOOLSET_NAMES) {
        assert.strictEqual(normalizeToolsetName(name), name);
      }
    });

    void it('throws AzureDevOpsValidationError mentioning valid presets for unknown toolsets', () => {
      assert.throws(
        () => normalizeToolsetName('nonexistent'),
        (err: unknown) => {
          assert.ok(err instanceof AzureDevOpsValidationError);
          for (const preset of TOOLSET_PRESET_NAMES) {
            assert.ok(err.message.includes(preset));
          }
          return true;
        },
      );
    });
  });

  void describe('expandToolsetNames', () => {
    void it('expands all 4 curated workflow presets and underscore aliases', () => {
      assert.deepStrictEqual(
        expandToolsetNames('pr-review'),
        TOOLSET_PRESETS['pr-review'],
      );
      assert.deepStrictEqual(
        expandToolsetNames('pr_review'),
        TOOLSET_PRESETS['pr-review'],
      );
      assert.deepStrictEqual(
        expandToolsetNames('PR-REVIEW'),
        TOOLSET_PRESETS['pr-review'],
      );
      assert.deepStrictEqual(
        expandToolsetNames('ci-debug'),
        TOOLSET_PRESETS['ci-debug'],
      );
      assert.deepStrictEqual(
        expandToolsetNames('ci_debug'),
        TOOLSET_PRESETS['ci-debug'],
      );
      assert.deepStrictEqual(
        expandToolsetNames('boards'),
        TOOLSET_PRESETS.boards,
      );
      assert.deepStrictEqual(expandToolsetNames('core'), TOOLSET_PRESETS.core);
      assert.strictEqual(expandToolsetNames('ALL'), 'all');
      assert.deepStrictEqual(expandToolsetNames('prs'), ['pull-requests']);
    });

    void it('throws AzureDevOpsValidationError mentioning valid presets on unknown value', () => {
      assert.throws(
        () => expandToolsetNames('unknown-preset'),
        (err: unknown) => {
          assert.ok(err instanceof AzureDevOpsValidationError);
          for (const preset of TOOLSET_PRESET_NAMES) {
            assert.ok(err.message.includes(preset));
          }
          return true;
        },
      );
    });
  });

  void describe('resolveEnabledTools', () => {
    void it('enables all tools by default', () => {
      const registry = makeRegistry();
      const result = resolveEnabledTools(registry);
      assert.strictEqual(result.tools.length, result.allToolNames.size);
      assert.strictEqual(result.readOnlyBlockedNames.size, 0);
    });

    void it('filters by toolsets (including aliases and all)', () => {
      const registry = makeRegistry();
      const subset = resolveEnabledTools(registry, {
        toolsets: ['projects', 'prs'],
      });
      assert.deepStrictEqual(
        subset.tools.map((t) => t.name),
        [
          'list_projects',
          'get_project',
          'list_pull_requests',
          'create_pull_request',
        ],
      );

      const all = resolveEnabledTools(registry, { toolsets: ['all'] });
      assert.strictEqual(all.tools.length, all.allToolNames.size);
    });

    void it('filters by enabledTools and intersects with toolsets', () => {
      const registry = makeRegistry();
      const result = resolveEnabledTools(registry, {
        toolsets: ['projects', 'work-items'],
        enabledTools: ['get_project', 'get_work_item', 'list_pipelines'],
      });
      assert.deepStrictEqual(
        result.tools.map((t) => t.name),
        ['get_project', 'get_work_item'],
      );
    });

    void it('throws on unknown tool in enabledTools', () => {
      assert.throws(
        () =>
          resolveEnabledTools(makeRegistry(), {
            enabledTools: ['does_not_exist'],
          }),
        AzureDevOpsValidationError,
      );
    });

    void it('removes disabledTools and warns on unknown disabled tool names', () => {
      const stderrChunks: string[] = [];
      const stderrMock = mock.method(
        process.stderr,
        'write',
        (chunk: unknown) => {
          stderrChunks.push(String(chunk));
          return true;
        },
      );

      try {
        const result = resolveEnabledTools(makeRegistry(), {
          toolsets: ['projects'],
          disabledTools: ['get_project', 'unknown_legacy_tool'],
        });
        assert.deepStrictEqual(
          result.tools.map((t) => t.name),
          ['list_projects'],
        );
        assert.ok(
          stderrChunks.some((chunk) => chunk.includes('unknown_legacy_tool')),
        );
      } finally {
        stderrMock.mock.restore();
      }
    });

    void it('enforces fail-closed read-only mode even when write tools are in enabledTools', () => {
      const result = resolveEnabledTools(makeRegistry(), {
        enabledTools: [
          'get_work_item',
          'create_work_item',
          'unmarked_write_tool',
        ],
        readOnly: true,
      });

      assert.deepStrictEqual(
        result.tools.map((t) => t.name),
        ['get_work_item'],
      );
      assert.strictEqual(
        result.readOnlyBlockedNames.has('create_work_item'),
        true,
      );
      assert.strictEqual(
        result.readOnlyBlockedNames.has('unmarked_write_tool'),
        true,
      );
    });

    void it('expands all 4 curated workflow presets in canonical TOOLSET_NAMES order', () => {
      const registry = makeRegistry();

      const prReview = resolveEnabledTools(registry, {
        toolsets: ['pr-review'],
      });
      assert.deepStrictEqual(
        prReview.tools.map((t) => t.name),
        [
          'get_me',
          'list_projects',
          'get_project',
          'list_repositories',
          'create_commit',
          'list_pull_requests',
          'create_pull_request',
        ],
      );

      const ciDebug = resolveEnabledTools(registry, {
        toolsets: ['ci_debug'],
      });
      // Canonical TOOLSET_NAMES order puts pull-requests before pipelines
      assert.deepStrictEqual(
        ciDebug.tools.map((t) => t.name),
        [
          'list_projects',
          'get_project',
          'list_pull_requests',
          'create_pull_request',
          'list_pipelines',
          'trigger_pipeline',
        ],
      );

      const boards = resolveEnabledTools(registry, {
        toolsets: ['boards'],
      });
      assert.deepStrictEqual(
        boards.tools.map((t) => t.name),
        [
          'get_me',
          'list_projects',
          'get_project',
          'get_work_item',
          'create_work_item',
          'unmarked_write_tool',
          'search_code',
        ],
      );

      const core = resolveEnabledTools(registry, {
        toolsets: ['core'],
      });
      assert.deepStrictEqual(
        core.tools.map((t) => t.name),
        [
          'get_me',
          'list_organizations',
          'list_projects',
          'get_project',
          'list_repositories',
          'create_commit',
          'get_work_item',
          'create_work_item',
          'unmarked_write_tool',
          'list_pull_requests',
          'create_pull_request',
        ],
      );
    });

    void it('mixes presets and individual toolsets with deduplication and canonical ordering', () => {
      const registry = makeRegistry();
      const mixed = resolveEnabledTools(registry, {
        toolsets: ['wikis', 'pr-review', 'projects', 'pr_review'],
      });

      assert.deepStrictEqual(
        mixed.tools.map((t) => t.name),
        [
          'get_me',
          'list_projects',
          'get_project',
          'list_repositories',
          'create_commit',
          'list_pull_requests',
          'create_pull_request',
          'get_wikis',
          'create_wiki_page',
        ],
      );
    });
  });

  void describe('spotlighting config resolution', () => {
    void it('defaults to true, reads AZURE_DEVOPS_SPOTLIGHTING, and lets CLI override', () => {
      const stderrMock = mock.method(process.stderr, 'write', () => true);
      try {
        const defaultConfig = getConfig([], {
          AZURE_DEVOPS_ORG_URL: 'https://dev.azure.com/test-org',
        });
        assert.strictEqual(defaultConfig.spotlighting, true);

        const envDisabled = getConfig([], {
          AZURE_DEVOPS_ORG_URL: 'https://dev.azure.com/test-org',
          AZURE_DEVOPS_SPOTLIGHTING: 'false',
        });
        assert.strictEqual(envDisabled.spotlighting, false);

        const cliDisabledOverEnv = getConfig(['--no-spotlighting'], {
          AZURE_DEVOPS_ORG_URL: 'https://dev.azure.com/test-org',
          AZURE_DEVOPS_SPOTLIGHTING: 'true',
        });
        assert.strictEqual(cliDisabledOverEnv.spotlighting, false);

        const cliEnabledOverEnv = getConfig(['--spotlighting'], {
          AZURE_DEVOPS_ORG_URL: 'https://dev.azure.com/test-org',
          AZURE_DEVOPS_SPOTLIGHTING: 'false',
        });
        assert.strictEqual(cliEnabledOverEnv.spotlighting, true);

        const cliEqualsDisabled = getConfig(['--spotlighting=false'], {
          AZURE_DEVOPS_ORG_URL: 'https://dev.azure.com/test-org',
          AZURE_DEVOPS_SPOTLIGHTING: 'true',
        });
        assert.strictEqual(cliEqualsDisabled.spotlighting, false);
      } finally {
        stderrMock.mock.restore();
      }
    });

    void it('fails fast on invalid AZURE_DEVOPS_SPOTLIGHTING values', () => {
      const stderrMock = mock.method(process.stderr, 'write', () => true);
      try {
        assert.throws(
          () =>
            getConfig([], {
              AZURE_DEVOPS_ORG_URL: 'https://dev.azure.com/test-org',
              AZURE_DEVOPS_SPOTLIGHTING: 'maybe',
            }),
          (err: unknown) => {
            assert.ok(err instanceof AzureDevOpsValidationError);
            assert.match(err.message, /AZURE_DEVOPS_SPOTLIGHTING/);
            return true;
          },
        );
      } finally {
        stderrMock.mock.restore();
      }
    });
  });
});
