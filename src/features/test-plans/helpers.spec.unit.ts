import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import {
  SuiteExpand,
  TestSuiteType,
} from 'azure-devops-node-api/interfaces/TestPlanInterfaces.js';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsError,
  AzureDevOpsPermissionError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../../shared/errors/index.ts';
import {
  deduplicateIds,
  extractContinuationToken,
  fetchPagedTestPlanCollection,
  formatTestStepsXml,
  isValidIsoDateString,
  mapSuiteExpand,
  mapSuiteType,
  mapTestPlanError,
  parseStrictIsoDate,
  resolveProjectId,
  TEST_PLANS_LOCATION_ID,
} from './helpers.ts';

void describe('test-plans helpers', () => {
  void describe('resolveProjectId', () => {
    void it('returns trimmed explicit projectId', () => {
      assert.strictEqual(resolveProjectId('  MyProject  '), 'MyProject');
    });

    void it('throws AzureDevOpsValidationError when projectId is omitted and no default project is set', () => {
      const orig = process.env.AZURE_DEVOPS_DEFAULT_PROJECT;
      delete process.env.AZURE_DEVOPS_DEFAULT_PROJECT;
      try {
        assert.throws(
          () => resolveProjectId(undefined),
          AzureDevOpsValidationError,
        );
      } finally {
        if (orig !== undefined) {
          process.env.AZURE_DEVOPS_DEFAULT_PROJECT = orig;
        }
      }
    });
  });

  void describe('enum mappers and deduplication', () => {
    void it('maps SuiteExpand values', () => {
      assert.strictEqual(mapSuiteExpand('none'), SuiteExpand.None);
      assert.strictEqual(mapSuiteExpand('children'), SuiteExpand.Children);
      assert.strictEqual(
        mapSuiteExpand('defaultTesters'),
        SuiteExpand.DefaultTesters,
      );
      assert.strictEqual(mapSuiteExpand(undefined), undefined);
    });

    void it('maps TestSuiteType values', () => {
      assert.strictEqual(
        mapSuiteType('staticTestSuite'),
        TestSuiteType.StaticTestSuite,
      );
      assert.strictEqual(
        mapSuiteType('requirementTestSuite'),
        TestSuiteType.RequirementTestSuite,
      );
      assert.strictEqual(
        mapSuiteType('dynamicTestSuite'),
        TestSuiteType.DynamicTestSuite,
      );
    });

    void it('deduplicates IDs while preserving order', () => {
      assert.deepStrictEqual(deduplicateIds([3, 1, 3, 2, 1]), [3, 1, 2]);
    });
  });

  void describe('formatTestStepsXml', () => {
    void it('encodes empty steps array', () => {
      assert.strictEqual(
        formatTestStepsXml([]),
        '<steps id="0" last="1"></steps>',
      );
    });

    void it('encodes ValidateStep and ActionStep with sequential IDs starting at 2 and XML escaping', () => {
      const xml = formatTestStepsXml([
        {
          action: 'Open <login> & click "Sign in"',
          expectedResult: 'User sees "Home" & status > 0',
        },
        {
          action: "Click 'Logout'",
        },
      ]);

      assert.ok(xml.includes('<steps id="0" last="3">'));
      assert.ok(xml.includes('<step id="2" type="ValidateStep">'));
      assert.ok(
        xml.includes(
          '&lt;P&gt;Open &amp;lt;login&amp;gt; &amp;amp; click &amp;quot;Sign in&amp;quot;&lt;/P&gt;',
        ),
      );
      assert.ok(
        xml.includes(
          '&lt;P&gt;User sees &amp;quot;Home&amp;quot; &amp;amp; status &amp;gt; 0&lt;/P&gt;',
        ),
      );
      assert.ok(xml.includes('<step id="3" type="ActionStep">'));
      assert.ok(
        xml.includes(
          '<parameterizedString isformatted="true"></parameterizedString>',
        ),
      );
    });
  });

  void describe('extractContinuationToken & fetchPagedTestPlanCollection', () => {
    void it('extracts continuation token case-insensitively', () => {
      assert.strictEqual(
        extractContinuationToken({ 'x-ms-continuationtoken': 'tok-1' }),
        'tok-1',
      );
      assert.strictEqual(
        extractContinuationToken({ 'X-MS-ContinuationToken': ' tok-2 ' }),
        'tok-2',
      );
      assert.strictEqual(
        extractContinuationToken({ 'x-ms-continuationtoken': '  ' }),
        undefined,
      );
      assert.strictEqual(extractContinuationToken(undefined), undefined);
    });

    void it('uses vsoClient + rest.get to capture continuation token header', async () => {
      const getVersioningData = mock.fn((..._args: unknown[]) =>
        Promise.resolve({
          requestUrl: 'https://dev.azure.com/org/proj/_apis/testplan/plans',
          apiVersion: '7.1',
        }),
      );
      const createRequestOptions = mock.fn(() => ({
        acceptHeader: 'application/json',
      }));
      const restGet = mock.fn(() =>
        Promise.resolve({
          result: { value: [{ id: 10, name: 'Sprint 1' }] },
          headers: { 'x-ms-continuationtoken': 'next-page-token' },
        }),
      );
      const formatResponse = mock.fn(() => [{ id: 10, name: 'Sprint 1' }]);

      const result = await fetchPagedTestPlanCollection({
        testPlanApi: {
          vsoClient: { getVersioningData },
          createRequestOptions,
          rest: { get: restGet },
          formatResponse,
        },
        apiVersion: '7.2-preview.1',
        locationId: TEST_PLANS_LOCATION_ID,
        routeValues: { project: 'proj' },
        queryParams: { filterActivePlans: true, owner: undefined },
        typeInfo: {},
        fallback: mock.fn(() => Promise.resolve(undefined)),
      });

      assert.strictEqual(getVersioningData.mock.callCount(), 1);
      assert.deepStrictEqual(getVersioningData.mock.calls[0]?.arguments, [
        '7.2-preview.1',
        'testplan',
        TEST_PLANS_LOCATION_ID,
        { project: 'proj' },
        { filterActivePlans: true },
      ]);
      assert.deepStrictEqual(result, {
        items: [{ id: 10, name: 'Sprint 1' }],
        continuationToken: 'next-page-token',
      });
    });

    void it('falls back to SDK method when vsoClient/rest are absent', async () => {
      const items = Object.assign([{ id: 1 }], { continuationToken: 'fb-tok' });
      const result = await fetchPagedTestPlanCollection({
        testPlanApi: {},
        apiVersion: '7.2-preview.1',
        locationId: TEST_PLANS_LOCATION_ID,
        routeValues: { project: 'proj' },
        queryParams: {},
        typeInfo: {},
        fallback: mock.fn(() => Promise.resolve(items)),
      });

      assert.deepStrictEqual(result, {
        items: [{ id: 1 }],
        continuationToken: 'fb-tok',
      });
    });

    void it('throws AzureDevOpsResourceNotFoundError when rest.get resolves with statusCode 404', async () => {
      await assert.rejects(
        () =>
          fetchPagedTestPlanCollection({
            testPlanApi: {
              vsoClient: {
                getVersioningData: mock.fn(() =>
                  Promise.resolve({
                    requestUrl:
                      'https://dev.azure.com/org/missing/_apis/testplan/plans',
                    apiVersion: '7.1',
                  }),
                ),
              },
              createRequestOptions: mock.fn(() => ({})),
              rest: {
                get: mock.fn(() =>
                  Promise.resolve({
                    statusCode: 404,
                    result: null,
                    headers: {},
                  }),
                ),
              },
            },
            apiVersion: '7.2-preview.1',
            locationId: TEST_PLANS_LOCATION_ID,
            routeValues: { project: 'missing' },
            queryParams: {},
            typeInfo: {},
            fallback: mock.fn(() => Promise.resolve(undefined)),
          }),
        AzureDevOpsResourceNotFoundError,
      );
    });
  });

  void describe('parseStrictIsoDate & isValidIsoDateString', () => {
    void it('accepts valid ISO 8601 dates and date-times with timezone offsets', () => {
      const d1 = parseStrictIsoDate('2026-06-01');
      assert.strictEqual(d1?.toISOString(), '2026-06-01T00:00:00.000Z');

      const leapDay = parseStrictIsoDate('2024-02-29');
      assert.strictEqual(leapDay?.toISOString(), '2024-02-29T00:00:00.000Z');

      const utcDateTime = parseStrictIsoDate('2026-06-01T12:30:45.123Z');
      assert.strictEqual(
        utcDateTime?.toISOString(),
        '2026-06-01T12:30:45.123Z',
      );

      const offsetDateTime = parseStrictIsoDate('2026-06-01T14:30:00+02:00');
      assert.strictEqual(
        offsetDateTime?.toISOString(),
        '2026-06-01T12:30:00.000Z',
      );

      assert.strictEqual(isValidIsoDateString('2026-06-01'), true);
      assert.strictEqual(isValidIsoDateString('2026-06-01T00:00:00Z'), true);
    });

    void it('rejects impossible calendar dates and non-ISO strings', () => {
      const invalidInputs = [
        '2026-02-30',
        '2025-02-29',
        '2026-04-31',
        '2026-13-01',
        '2026-00-10',
        '2026-02-30T12:00:00Z',
        '2026-06-01T25:00:00Z',
        '2026-06-01T12:00:00+25:00',
        '2026-06-01T12:00:00',
        'March 1, 2026',
        '06/01/2026',
        '2026-6-1',
        '',
      ];
      for (const input of invalidInputs) {
        assert.strictEqual(parseStrictIsoDate(input), null);
        assert.strictEqual(isValidIsoDateString(input), false);
      }
    });
  });

  void describe('mapTestPlanError', () => {
    void it('maps HTTP status codes to typed AzureDevOpsError subclasses', () => {
      assert.throws(
        () =>
          mapTestPlanError(
            Object.assign(new Error('bad'), { statusCode: 400 }),
            'ctx',
          ),
        AzureDevOpsValidationError,
      );
      assert.throws(
        () =>
          mapTestPlanError(
            Object.assign(new Error('unauth'), { statusCode: 401 }),
            'ctx',
          ),
        AzureDevOpsAuthenticationError,
      );
      assert.throws(
        () =>
          mapTestPlanError(
            Object.assign(new Error('denied'), { statusCode: 403 }),
            'ctx',
          ),
        AzureDevOpsPermissionError,
      );
      assert.throws(
        () =>
          mapTestPlanError(
            Object.assign(new Error('missing'), { statusCode: 404 }),
            'ctx',
          ),
        AzureDevOpsResourceNotFoundError,
      );
      assert.throws(
        () => mapTestPlanError(new Error('boom'), 'ctx'),
        AzureDevOpsError,
      );
    });

    void it('tailors 403 permission guidance to test-read, test-write, and work-item-write scopes', () => {
      const err403 = Object.assign(new Error('Forbidden'), { statusCode: 403 });

      assert.throws(
        () => mapTestPlanError(err403, 'read', 'test-read'),
        (err: unknown) => {
          assert.ok(err instanceof AzureDevOpsPermissionError);
          assert.match(err.message, /vso\.test\)/);
          assert.doesNotMatch(err.message, /Basic \+ Test Plans/);
          return true;
        },
      );

      assert.throws(
        () => mapTestPlanError(err403, 'write', 'test-write'),
        (err: unknown) => {
          assert.ok(err instanceof AzureDevOpsPermissionError);
          assert.match(err.message, /vso\.test_write.*Basic \+ Test Plans/);
          return true;
        },
      );

      assert.throws(
        () => mapTestPlanError(err403, 'wit', 'work-item-write'),
        (err: unknown) => {
          assert.ok(err instanceof AzureDevOpsPermissionError);
          assert.match(err.message, /vso\.work_write/);
          assert.doesNotMatch(err.message, /Basic \+ Test Plans/);
          return true;
        },
      );
    });

    void it('rethrows existing AzureDevOpsError instances unchanged', () => {
      const existing = new AzureDevOpsValidationError('already typed');
      assert.throws(
        () => mapTestPlanError(existing, 'ctx'),
        (err: unknown) => {
          assert.strictEqual(err, existing);
          return true;
        },
      );
    });
  });
});
