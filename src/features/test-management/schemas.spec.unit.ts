import { UpdateTestResultsSchema } from './schemas';

describe('test management schemas', () => {
  it.each([
    'Passed',
    'Failed',
    'Blocked',
    'NotApplicable',
    'Inconclusive',
    'Paused',
    'NotExecuted',
    'Timeout',
    'Aborted',
    'Warning',
    'Error',
    'InProgress',
    'NotImpacted',
  ])('accepts the Azure DevOps test outcome %s', (outcome) => {
    expect(() =>
      UpdateTestResultsSchema.parse({
        projectId: 'Example',
        runId: 41,
        results: [{ id: 501, outcome }],
      }),
    ).not.toThrow();
  });
});
