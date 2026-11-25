import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  AddPullRequestCommentSchema,
  MergePullRequestSchema,
} from './schemas.ts';

void describe('pull request schema cross-field refinements', () => {
  const issuesOf = (
    schema: typeof AddPullRequestCommentSchema | typeof MergePullRequestSchema,
    input: object,
  ) => {
    const result = schema.safeParse(input);
    return result.success
      ? []
      : result.error.issues.map(({ path, message }) => ({ path, message }));
  };

  void describe('AddPullRequestCommentSchema', () => {
    const fileComment = {
      pullRequestId: 123,
      content: 'c',
      status: 'active',
      filePath: '/src/app.ts',
    };

    void test('accepts valid file comments with or without line ranges', () => {
      assert.deepStrictEqual(
        issuesOf(AddPullRequestCommentSchema, fileComment),
        [],
      );
      assert.deepStrictEqual(
        issuesOf(AddPullRequestCommentSchema, {
          ...fileComment,
          lineNumber: 2,
          endLineNumber: 5,
        }),
        [],
      );
    });

    void test('rejects endLineNumber before lineNumber or without filePath + lineNumber', () => {
      assert.deepStrictEqual(
        issuesOf(AddPullRequestCommentSchema, {
          ...fileComment,
          lineNumber: 3,
          endLineNumber: 2,
        }),
        [
          {
            path: ['endLineNumber'],
            message: 'endLineNumber must not be less than lineNumber',
          },
        ],
      );

      assert.deepStrictEqual(
        issuesOf(AddPullRequestCommentSchema, {
          ...fileComment,
          endLineNumber: 3,
        }),
        [
          {
            path: ['endLineNumber'],
            message: 'endLineNumber requires filePath and lineNumber',
          },
        ],
      );
    });
  });

  void describe('MergePullRequestSchema', () => {
    void test('does not inject a default mergeStrategy and trims optional strings', () => {
      const parsed = MergePullRequestSchema.parse({
        pullRequestId: 42,
        bypassPolicy: true,
        bypassReason: '  Emergency hotfix  ',
        lastMergeSourceCommitId: '  abc123def  ',
      });
      assert.strictEqual(parsed.mergeStrategy, undefined);
      assert.strictEqual(parsed.bypassReason, 'Emergency hotfix');
      assert.strictEqual(parsed.lastMergeSourceCommitId, 'abc123def');
    });

    void test('rejects bypassReason without bypassPolicy=true', () => {
      assert.deepStrictEqual(
        issuesOf(MergePullRequestSchema, {
          pullRequestId: 42,
          bypassReason: 'Emergency fix',
        }),
        [
          {
            path: ['bypassReason'],
            message: 'bypassReason requires bypassPolicy to be true',
          },
        ],
      );
    });

    void test('rejects bypassPolicy when canceling auto-complete', () => {
      assert.deepStrictEqual(
        issuesOf(MergePullRequestSchema, {
          pullRequestId: 42,
          autoComplete: false,
          bypassPolicy: true,
        }),
        [
          {
            path: ['bypassPolicy'],
            message: 'bypassPolicy cannot be used when canceling auto-complete',
          },
        ],
      );
    });

    void test('rejects autoCompleteIgnoreConfigIds unless autoComplete is true', () => {
      assert.deepStrictEqual(
        issuesOf(MergePullRequestSchema, {
          pullRequestId: 42,
          autoComplete: false,
          autoCompleteIgnoreConfigIds: [1],
        }),
        [
          {
            path: ['autoCompleteIgnoreConfigIds'],
            message:
              'autoCompleteIgnoreConfigIds requires autoComplete to be true',
          },
        ],
      );

      assert.deepStrictEqual(
        issuesOf(MergePullRequestSchema, {
          pullRequestId: 42,
          autoComplete: true,
          autoCompleteIgnoreConfigIds: [1, 2],
        }),
        [],
      );
    });
  });
});
