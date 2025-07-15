import {
  CommentThreadStatus,
  CommentType,
  GitVersionType,
} from 'azure-devops-node-api/interfaces/GitInterfaces';
import { PullRequestStatus } from 'azure-devops-node-api/interfaces/GitInterfaces';

/**
 * Generic enum mapper that creates bidirectional mappings between strings and numeric enums
 */
function createEnumMapper(
  mappings: Record<string, number>,
  defaultStringValue = 'unknown',
) {
  // Create reverse mapping from enum values to strings
  const reverseMap = Object.entries(mappings).reduce(
    (acc, [key, value]) => {
      acc[value] = key;
      return acc;
    },
    {} as Record<number, string>,
  );

  return {
    toEnum: (value: string): number | undefined => {
      const lowerValue = value.toLowerCase();
      return mappings[lowerValue];
    },
    toString: (value: number): string => {
      return reverseMap[value] ?? defaultStringValue;
    },
  };
}

/**
 * CommentThreadStatus enum mappings
 */
export const commentThreadStatusMapper = createEnumMapper({
  unknown: CommentThreadStatus.Unknown,
  active: CommentThreadStatus.Active,
  fixed: CommentThreadStatus.Fixed,
  wontfix: CommentThreadStatus.WontFix,
  closed: CommentThreadStatus.Closed,
  bydesign: CommentThreadStatus.ByDesign,
  pending: CommentThreadStatus.Pending,
});

/**
 * CommentType enum mappings
 */
export const commentTypeMapper = createEnumMapper({
  unknown: CommentType.Unknown,
  text: CommentType.Text,
  codechange: CommentType.CodeChange,
  system: CommentType.System,
});

/**
 * PullRequestStatus enum mappings
 */
export const pullRequestStatusMapper = createEnumMapper({
  active: PullRequestStatus.Active,
  abandoned: PullRequestStatus.Abandoned,
  completed: PullRequestStatus.Completed,
});

/**
 * GitVersionType enum mappings
 */
export const gitVersionTypeMapper = createEnumMapper({
  branch: GitVersionType.Branch,
  commit: GitVersionType.Commit,
  tag: GitVersionType.Tag,
});

/**
 * Transform comment thread status from numeric to string
 */
export function transformCommentThreadStatus(
  status?: number,
): string | undefined {
  return status !== undefined
    ? commentThreadStatusMapper.toString(status)
    : undefined;
}

/**
 * Transform comment type from numeric to string
 */
export function transformCommentType(type?: number): string | undefined {
  return type !== undefined ? commentTypeMapper.toString(type) : undefined;
}

/**
 * Transform pull request status from numeric to string
 */
export function transformPullRequestStatus(
  status?: number,
): string | undefined {
  return status !== undefined
    ? pullRequestStatusMapper.toString(status)
    : undefined;
}
