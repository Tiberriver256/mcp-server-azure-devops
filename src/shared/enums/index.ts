import {
  CommentThreadStatus,
  CommentType,
  GitPullRequestMergeStrategy,
  GitVersionType,
  PullRequestStatus,
} from 'azure-devops-node-api/interfaces/GitInterfaces';

export interface EnumMapper {
  readonly keys: readonly string[];
  toEnum: (value: string) => number | undefined;
  toString: (value: number) => string;
}

/**
 * Generic enum mapper that creates prototype-safe bidirectional mappings
 * between case-insensitive strings and numeric enums.
 */
function createEnumMapper(
  mappings: Record<string, number>,
  defaultStringValue = 'unknown',
): EnumMapper {
  const normalizedMappings = new Map<string, number>();
  const reverseMap = new Map<number, string>();
  const keys: string[] = [];

  for (const [key, value] of Object.entries(mappings)) {
    keys.push(key);
    normalizedMappings.set(key.toLowerCase(), value);
    reverseMap.set(value, key);
  }

  return {
    keys,
    toEnum: (value: string): number | undefined => {
      return normalizedMappings.get(value.toLowerCase());
    },
    toString: (value: number): string => {
      return reverseMap.get(value) ?? defaultStringValue;
    },
  };
}

export const commentThreadStatusMapper = createEnumMapper({
  unknown: CommentThreadStatus.Unknown,
  active: CommentThreadStatus.Active,
  fixed: CommentThreadStatus.Fixed,
  wontfix: CommentThreadStatus.WontFix,
  closed: CommentThreadStatus.Closed,
  bydesign: CommentThreadStatus.ByDesign,
  pending: CommentThreadStatus.Pending,
});

export const commentTypeMapper = createEnumMapper({
  unknown: CommentType.Unknown,
  text: CommentType.Text,
  codechange: CommentType.CodeChange,
  system: CommentType.System,
});

export const pullRequestStatusMapper = createEnumMapper({
  active: PullRequestStatus.Active,
  abandoned: PullRequestStatus.Abandoned,
  completed: PullRequestStatus.Completed,
});

export const pullRequestMergeStrategyMapper = createEnumMapper({
  noFastForward: GitPullRequestMergeStrategy.NoFastForward,
  squash: GitPullRequestMergeStrategy.Squash,
  rebase: GitPullRequestMergeStrategy.Rebase,
  rebaseMerge: GitPullRequestMergeStrategy.RebaseMerge,
});

export const gitVersionTypeMapper = createEnumMapper({
  branch: GitVersionType.Branch,
  commit: GitVersionType.Commit,
  tag: GitVersionType.Tag,
});

export function transformCommentThreadStatus(
  status?: number,
): string | undefined {
  return status !== undefined
    ? commentThreadStatusMapper.toString(status)
    : undefined;
}

export function transformCommentType(type?: number): string | undefined {
  return type !== undefined ? commentTypeMapper.toString(type) : undefined;
}

export function transformPullRequestStatus(
  status?: number,
): string | undefined {
  return status !== undefined
    ? pullRequestStatusMapper.toString(status)
    : undefined;
}
