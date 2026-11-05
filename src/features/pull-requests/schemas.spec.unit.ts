import { AddPullRequestCommentSchema } from './schemas';

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
});
