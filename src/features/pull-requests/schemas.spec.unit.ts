import { toJsonSchema } from '../../shared/utils/to-json-schema';
import { AddPullRequestCommentSchema, MergePullRequestSchema } from './schemas';

describe('pull request schemas', () => {
  describe('AddPullRequestCommentSchema', () => {
    const fileComment = {
      pullRequestId: 123,
      content: 'c',
      status: 'active',
      filePath: '/src/app.ts',
    };

    const issuesOf = (input: object) => {
      const result = AddPullRequestCommentSchema.safeParse(input);
      return result.success
        ? []
        : result.error.issues.map(({ path, message }) => ({ path, message }));
    };

    test.each([
      { lineNumber: 2 },
      { lineNumber: 2, endLineNumber: 2 },
      { lineNumber: 2, endLineNumber: 5 },
    ])('should accept the line range %o', (lines) => {
      expect(issuesOf({ ...fileComment, ...lines })).toEqual([]);
    });

    test('should accept a file comment without lineNumber', () => {
      expect(issuesOf(fileComment)).toEqual([]);
    });

    test('should reject an endLineNumber before lineNumber', () => {
      expect(
        issuesOf({ ...fileComment, lineNumber: 3, endLineNumber: 2 }),
      ).toEqual([
        {
          path: ['endLineNumber'],
          message: 'endLineNumber must not be less than lineNumber',
        },
      ]);
    });

    test.each([
      { endLineNumber: 3 },
      { filePath: undefined, lineNumber: 2, endLineNumber: 3 },
    ])(
      'should reject endLineNumber without filePath and lineNumber: %o',
      (lines) => {
        expect(issuesOf({ ...fileComment, ...lines })).toEqual([
          {
            path: ['endLineNumber'],
            message: 'endLineNumber requires filePath and lineNumber',
          },
        ]);
      },
    );

    test.each([
      ['lineNumber', 0],
      ['lineNumber', -1],
      ['lineNumber', 1.5],
      ['endLineNumber', 0],
      ['endLineNumber', 2.5],
    ])('should reject %s %p', (field, value) => {
      const issues = issuesOf({
        ...fileComment,
        lineNumber: 1,
        [field]: value,
      });

      expect(issues.map(({ path }) => path)).toContainEqual([field]);
    });
  });

  describe('MergePullRequestSchema', () => {
    const issuesOf = (input: object) => {
      const result = MergePullRequestSchema.safeParse(input);
      return result.success
        ? []
        : result.error.issues.map(({ path, message }) => ({ path, message }));
    };

    test('should accept minimal valid input without forcing mergeStrategy default', () => {
      const result = MergePullRequestSchema.safeParse({ pullRequestId: 42 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.pullRequestId).toBe(42);
        expect(result.data.mergeStrategy).toBeUndefined();
        expect(result.data.deleteSourceBranch).toBeUndefined();
        expect(result.data.autoComplete).toBeUndefined();
      }
    });

    test.each(['noFastForward', 'squash', 'rebase', 'rebaseMerge'] as const)(
      'should accept mergeStrategy %s',
      (mergeStrategy) => {
        expect(issuesOf({ pullRequestId: 42, mergeStrategy })).toEqual([]);
      },
    );

    test('should reject invalid mergeStrategy', () => {
      const issues = issuesOf({
        pullRequestId: 42,
        mergeStrategy: 'fastForward',
      });
      expect(issues.map(({ path }) => path)).toContainEqual(['mergeStrategy']);
    });

    test.each([0, -1, 1.5])('should reject invalid pullRequestId %p', (id) => {
      const issues = issuesOf({ pullRequestId: id });
      expect(issues.map(({ path }) => path)).toContainEqual(['pullRequestId']);
    });

    test('should accept bypassPolicy with trimmed bypassReason', () => {
      const result = MergePullRequestSchema.safeParse({
        pullRequestId: 42,
        bypassPolicy: true,
        bypassReason: '  Emergency hotfix  ',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.bypassReason).toBe('Emergency hotfix');
      }
    });

    test.each(['', '   '])('should reject blank bypassReason %p', (reason) => {
      const issues = issuesOf({
        pullRequestId: 42,
        bypassPolicy: true,
        bypassReason: reason,
      });
      expect(issues.map(({ path }) => path)).toContainEqual(['bypassReason']);
    });

    test.each([undefined, false])(
      'should reject bypassReason when bypassPolicy is %p',
      (bypassPolicy) => {
        expect(
          issuesOf({
            pullRequestId: 42,
            bypassPolicy,
            bypassReason: 'Emergency fix',
          }),
        ).toEqual([
          {
            path: ['bypassReason'],
            message: 'bypassReason requires bypassPolicy to be true',
          },
        ]);
      },
    );

    test('should reject bypassPolicy when canceling autoComplete', () => {
      expect(
        issuesOf({
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

    test('should accept autoCompleteIgnoreConfigIds when autoComplete is true', () => {
      expect(
        issuesOf({
          pullRequestId: 42,
          autoComplete: true,
          autoCompleteIgnoreConfigIds: [1, 2],
        }),
      ).toEqual([]);
    });

    test.each([
      { autoComplete: undefined, autoCompleteIgnoreConfigIds: [1] },
      { autoComplete: false, autoCompleteIgnoreConfigIds: [1] },
      { autoComplete: undefined, autoCompleteIgnoreConfigIds: [] },
      { autoComplete: false, autoCompleteIgnoreConfigIds: [] },
    ])(
      'should reject autoCompleteIgnoreConfigIds when autoComplete is not true: %o',
      (input) => {
        expect(issuesOf({ pullRequestId: 42, ...input })).toEqual([
          {
            path: ['autoCompleteIgnoreConfigIds'],
            message:
              'autoCompleteIgnoreConfigIds requires autoComplete to be true',
          },
        ]);
      },
    );

    test.each([0, -5, 1.2])(
      'should reject non-positive/non-integer autoCompleteIgnoreConfigIds entry %p',
      (configId) => {
        const issues = issuesOf({
          pullRequestId: 42,
          autoComplete: true,
          autoCompleteIgnoreConfigIds: [configId],
        });
        expect(issues.map(({ path }) => path)).toContainEqual([
          'autoCompleteIgnoreConfigIds',
          0,
        ]);
      },
    );

    test.each(['', '   '])(
      'should reject empty or whitespace-only lastMergeSourceCommitId %p',
      (commitId) => {
        const issues = issuesOf({
          pullRequestId: 42,
          lastMergeSourceCommitId: commitId,
        });
        expect(issues.map(({ path }) => path)).toContainEqual([
          'lastMergeSourceCommitId',
        ]);
      },
    );

    test('should trim lastMergeSourceCommitId', () => {
      const result = MergePullRequestSchema.safeParse({
        pullRequestId: 42,
        lastMergeSourceCommitId: '  abc123def  ',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.lastMergeSourceCommitId).toBe('abc123def');
      }
    });

    test('should serialize to a valid JSON Schema object with all properties', () => {
      const jsonSchema = toJsonSchema(MergePullRequestSchema);
      expect(jsonSchema.type).toBe('object');
      expect(jsonSchema.required).toEqual(['pullRequestId']);
      const properties = jsonSchema.properties as Record<string, unknown>;
      expect(Object.keys(properties)).toEqual(
        expect.arrayContaining([
          'projectId',
          'organizationId',
          'repositoryId',
          'pullRequestId',
          'mergeStrategy',
          'deleteSourceBranch',
          'transitionWorkItems',
          'mergeCommitMessage',
          'bypassPolicy',
          'bypassReason',
          'autoComplete',
          'autoCompleteIgnoreConfigIds',
          'lastMergeSourceCommitId',
        ]),
      );
      expect(
        (properties.mergeStrategy as Record<string, unknown>).default,
      ).toBeUndefined();
    });
  });
});
