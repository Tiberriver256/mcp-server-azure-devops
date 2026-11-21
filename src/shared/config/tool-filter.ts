import { ToolDefinition } from '../types/tool-definition';
import { AzureDevOpsValidationError } from '../errors';

export const TOOLSET_NAMES = [
  'users',
  'organizations',
  'projects',
  'repositories',
  'work-items',
  'search',
  'pull-requests',
  'pipelines',
  'wikis',
] as const;

export type ToolsetName = (typeof TOOLSET_NAMES)[number];

export interface ToolFilterOptions {
  toolsets?: string[];
  enabledTools?: string[];
  disabledTools?: string[];
  readOnly?: boolean;
}

export interface ResolvedToolCatalog {
  tools: ToolDefinition[];
  enabledToolNames: Set<string>;
  allToolNames: Set<string>;
  readOnlyBlockedNames: Set<string>;
}

const TOOLSET_ALIASES: Record<string, ToolsetName> = {
  users: 'users',
  organizations: 'organizations',
  projects: 'projects',
  repositories: 'repositories',
  repos: 'repositories',
  'work-items': 'work-items',
  work_items: 'work-items',
  workitems: 'work-items',
  search: 'search',
  'pull-requests': 'pull-requests',
  pull_requests: 'pull-requests',
  pullrequests: 'pull-requests',
  prs: 'pull-requests',
  pipelines: 'pipelines',
  wikis: 'wikis',
};

/**
 * Parse a comma-separated string into a deduplicated list of trimmed non-empty entries.
 */
export function parseCsvList(value?: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return items.length > 0 ? Array.from(new Set(items)) : undefined;
}

/**
 * Parse a boolean string from environment variables or CLI flags.
 */
export function parseBooleanOption(
  value?: string,
  optionName = 'option',
): boolean | undefined {
  if (value === undefined || value.trim() === '') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false;
  }

  throw new AzureDevOpsValidationError(
    `Invalid boolean value '${value}' for ${optionName}. Expected true or false.`,
  );
}

/**
 * Parse tool-filtering CLI flags from argv (excluding node & script path).
 * Supports both `--flag value` and `--flag=value`.
 * Fails fast on unknown flags or empty/malformed values to prevent fail-open typos.
 */
export function parseCliToolFilterArgs(argv: string[]): ToolFilterOptions {
  const options: ToolFilterOptions = {};

  const readCsvFlag = (
    flag: string,
    inlineValue: string | undefined,
    idx: number,
  ): { values: string[]; nextIdx: number } => {
    let raw: string;
    let nextIdx = idx;

    if (inlineValue !== undefined) {
      raw = inlineValue;
    } else {
      const next = argv[idx + 1];
      if (next === undefined || next.startsWith('-')) {
        throw new AzureDevOpsValidationError(`Flag '${flag}' requires a value`);
      }
      raw = next;
      nextIdx = idx + 1;
    }

    const parsed = parseCsvList(raw);
    if (!parsed) {
      throw new AzureDevOpsValidationError(
        `Flag '${flag}' requires at least one non-empty value`,
      );
    }

    return { values: parsed, nextIdx };
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('-')) {
      throw new AzureDevOpsValidationError(
        `Unexpected argument '${arg}'. Supported flags: --toolsets, --enabled-tools, --disabled-tools, --read-only`,
      );
    }

    const eqIndex = arg.indexOf('=');
    const flag = eqIndex === -1 ? arg : arg.slice(0, eqIndex);
    const inlineValue = eqIndex === -1 ? undefined : arg.slice(eqIndex + 1);

    switch (flag) {
      case '--toolsets': {
        const { values, nextIdx } = readCsvFlag(flag, inlineValue, i);
        options.toolsets = values;
        i = nextIdx;
        break;
      }
      case '--enabled-tools': {
        const { values, nextIdx } = readCsvFlag(flag, inlineValue, i);
        options.enabledTools = values;
        i = nextIdx;
        break;
      }
      case '--disabled-tools': {
        const { values, nextIdx } = readCsvFlag(flag, inlineValue, i);
        options.disabledTools = values;
        i = nextIdx;
        break;
      }
      case '--read-only': {
        if (inlineValue !== undefined) {
          if (inlineValue.trim() === '') {
            throw new AzureDevOpsValidationError(
              `Flag '--read-only' requires a boolean value when '=' is used`,
            );
          }
          options.readOnly = parseBooleanOption(inlineValue, '--read-only');
        } else {
          const next = argv[i + 1];
          if (next !== undefined && !next.startsWith('-')) {
            options.readOnly = parseBooleanOption(next, '--read-only');
            i += 1;
          } else {
            options.readOnly = true;
          }
        }
        break;
      }
      default:
        throw new AzureDevOpsValidationError(
          `Unknown flag '${flag}'. Supported flags: --toolsets, --enabled-tools, --disabled-tools, --read-only`,
        );
    }
  }

  return options;
}

/**
 * Normalize a user-provided toolset name to its canonical ToolsetName (or 'all').
 */
export function normalizeToolsetName(raw: string): ToolsetName | 'all' {
  const key = raw.trim().toLowerCase();
  if (key === 'all') {
    return 'all';
  }
  const canonical = TOOLSET_ALIASES[key];
  if (!canonical) {
    throw new AzureDevOpsValidationError(
      `Unknown toolset '${raw}'. Valid toolsets are: all, ${TOOLSET_NAMES.join(', ')}`,
    );
  }
  return canonical;
}

/**
 * Resolve the active tool catalog from the full toolset registry and filter options.
 *
 * Evaluation order:
 * 1. Toolsets filter (`toolsets`, defaults to all toolsets when omitted or includes 'all')
 * 2. Explicit allowlist (`enabledTools`, intersects with selected toolsets)
 * 3. Explicit denylist (`disabledTools`, removes matching tools)
 * 4. Read-only mode (`readOnly: true`, fail-closed: only tools with `readOnly === true` remain)
 */
export function resolveEnabledTools(
  registry: Record<ToolsetName, ToolDefinition[]>,
  options: ToolFilterOptions = {},
): ResolvedToolCatalog {
  const allTools: ToolDefinition[] = [];
  for (const toolset of TOOLSET_NAMES) {
    allTools.push(...registry[toolset]);
  }
  const allToolNames = new Set(allTools.map((t) => t.name));

  // 1. Toolsets selection (preserve canonical TOOLSET_NAMES ordering)
  let selectedToolsets: ToolsetName[] = [...TOOLSET_NAMES];
  if (options.toolsets && options.toolsets.length > 0) {
    const normalized = options.toolsets.map(normalizeToolsetName);
    if (!normalized.includes('all')) {
      const selectedSet = new Set(normalized as ToolsetName[]);
      selectedToolsets = TOOLSET_NAMES.filter((name) => selectedSet.has(name));
    }
  }

  let candidateTools: ToolDefinition[] = [];
  for (const toolset of selectedToolsets) {
    candidateTools.push(...registry[toolset]);
  }

  // 2. Explicit allowlist
  if (options.enabledTools && options.enabledTools.length > 0) {
    const requested = new Set(options.enabledTools.map((t) => t.trim()));
    const unknown = Array.from(requested).filter(
      (name) => !allToolNames.has(name),
    );
    if (unknown.length > 0) {
      throw new AzureDevOpsValidationError(
        `Unknown tool(s) in enabledTools: ${unknown.join(', ')}`,
      );
    }
    candidateTools = candidateTools.filter((tool) => requested.has(tool.name));
  }

  // 3. Explicit denylist
  if (options.disabledTools && options.disabledTools.length > 0) {
    const blocked = new Set(options.disabledTools.map((t) => t.trim()));
    const unknown = Array.from(blocked).filter(
      (name) => !allToolNames.has(name),
    );
    if (unknown.length > 0) {
      process.stderr.write(
        `WARNING: Unrecognized tool(s) in disabledTools: ${unknown.join(', ')}\n`,
      );
    }
    candidateTools = candidateTools.filter((tool) => !blocked.has(tool.name));
  }

  // 4. Read-only mode (fail-closed: must be explicitly readOnly === true)
  const readOnlyBlockedNames = new Set<string>();
  if (options.readOnly) {
    const readOnlyTools: ToolDefinition[] = [];
    for (const tool of candidateTools) {
      if (tool.readOnly === true) {
        readOnlyTools.push(tool);
      } else {
        readOnlyBlockedNames.add(tool.name);
      }
    }
    candidateTools = readOnlyTools;
  }

  return {
    tools: candidateTools,
    enabledToolNames: new Set(candidateTools.map((t) => t.name)),
    allToolNames,
    readOnlyBlockedNames,
  };
}
