import { AddPullRequestCommentSchema, MergePullRequestSchema } from './schemas';

describe('pull request schema cross-field refinements', () => {
  const issuesOf = (
    schema: typeof AddPullRequestCommentSchema | typeof MergePullRequestSchema,
    input: object,
  ) => {
    const result = schema.safeParse(input);
    return result.success
      ? []
      : result.error.issues.map(({ path, message }) => ({ path, message }));
  };

  describe('AddPullRequestCommentSchema', () => {
    const fileComment = {
      pullRequestId: 123,
      content: 'c',
      status: 'active',
      filePath: '/src/app.ts',
    };

    test('accepts valid file comments with or without line ranges', () => {
      expect(issuesOf(AddPullRequestCommentSchema, fileComment)).toEqual([]);
      expect(
        issuesOf(AddPullRequestCommentSchema, {
          ...fileComment,
          lineNumber: 2,
          endLineNumber: 5,
        }),
      ).toEqual([]);
    });

    test('rejects endLineNumber before lineNumber or without filePath + lineNumber', () => {
      expect(
        issuesOf(AddPullRequestCommentSchema, {
          ...fileComment,
          lineNumber: 3,
          endLineNumber: 2,
        }),
      ).toEqual([
        {
          path: ['endLineNumber'],
          message: 'endLineNumber must not be less than lineNumber',
        },
      ]);

      expect(
        issuesOf(AddPullRequestCommentSchema, {
          ...fileComment,
          endLineNumber: 3,
        }),
      ).toEqual([
        {
          path: ['endLineNumber'],
          message: 'endLineNumber requires filePath and lineNumber',
        },
      ]);
    });
  });

  describe('MergePullRequestSchema', () => {
    test('does not inject a default mergeStrategy and trims optional strings', () => {
      const parsed = MergePullRequestSchema.parse({
        pullRequestId: 42,
        bypassPolicy: true,
        bypassReason: '  Emergency hotfix  ',
        lastMergeSourceCommitId: '  abc123def  ',
      });
      expect(parsed.mergeStrategy).toBeUndefined();
      expect(parsed.bypassReason).toBe('Emergency hotfix');
      expect(parsed.lastMergeSourceCommitId).toBe('abc123def');
    });

    test('rejects bypassReason without bypassPolicy=true', () => {
      expect(
        issuesOf(MergePullRequestSchema, {
          pullRequestId: 42,
          bypassReason: 'Emergency fix',
        }),
      ).toEqual([
        {
          path: ['bypassReason'],
          message: 'bypassReason requires bypassPolicy to be true',
        },
      ]);
    });

    test('rejects bypassPolicy when canceling auto-complete', () => {
      expect(
        issuesOf(MergePullRequestSchema, {
          pullRequestId: 42,
          autoComplete: false,
          bypassPolicy: true,
        }),
      ).toEqual([
        {
          path: ['bypassPolicy'],
          message: 'bypassPolicy cannot be used when canceling auto-complete',
        },
      ]);
    });

    test('rejects autoCompleteIgnoreConfigIds unless autoComplete is true', () => {
      expect(
        issuesOf(MergePullRequestSchema, {
          pullRequestId: 42,
          autoComplete: false,
          autoCompleteIgnoreConfigIds: [1],
        }),
      ).toEqual([
        {
          path: ['autoCompleteIgnoreConfigIds'],
          message:
            'autoCompleteIgnoreConfigIds requires autoComplete to be true',
        },
      ]);

      expect(
        issuesOf(MergePullRequestSchema, {
          pullRequestId: 42,
          autoComplete: true,
          autoCompleteIgnoreConfigIds: [1, 2],
        }),
      ).toEqual([]);
    });
  });
});
