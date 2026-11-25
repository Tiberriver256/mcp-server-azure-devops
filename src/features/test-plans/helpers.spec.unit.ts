import {
  SuiteExpand,
  TestSuiteType,
} from 'azure-devops-node-api/interfaces/TestPlanInterfaces';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsError,
  AzureDevOpsPermissionError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../../shared/errors';
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
} from './helpers';

describe('test-plans helpers', () => {
  describe('resolveProjectId', () => {
    it('returns trimmed explicit projectId', () => {
      expect(resolveProjectId('  MyProject  ')).toBe('MyProject');
    });

    it('throws AzureDevOpsValidationError when projectId is omitted and no default project is set', () => {
      const orig = process.env.AZURE_DEVOPS_DEFAULT_PROJECT;
      delete process.env.AZURE_DEVOPS_DEFAULT_PROJECT;
      try {
        expect(() => resolveProjectId(undefined)).toThrow(
          AzureDevOpsValidationError,
        );
      } finally {
        if (orig !== undefined) {
          process.env.AZURE_DEVOPS_DEFAULT_PROJECT = orig;
        }
      }
    });
  });

  describe('enum mappers and deduplication', () => {
    it('maps SuiteExpand values', () => {
      expect(mapSuiteExpand('none')).toBe(SuiteExpand.None);
      expect(mapSuiteExpand('children')).toBe(SuiteExpand.Children);
      expect(mapSuiteExpand('defaultTesters')).toBe(SuiteExpand.DefaultTesters);
      expect(mapSuiteExpand(undefined)).toBeUndefined();
    });

    it('maps TestSuiteType values', () => {
      expect(mapSuiteType('staticTestSuite')).toBe(
        TestSuiteType.StaticTestSuite,
      );
      expect(mapSuiteType('requirementTestSuite')).toBe(
        TestSuiteType.RequirementTestSuite,
      );
      expect(mapSuiteType('dynamicTestSuite')).toBe(
        TestSuiteType.DynamicTestSuite,
      );
    });

    it('deduplicates IDs while preserving order', () => {
      expect(deduplicateIds([3, 1, 3, 2, 1])).toEqual([3, 1, 2]);
    });
  });

  describe('formatTestStepsXml', () => {
    it('encodes empty steps array', () => {
      expect(formatTestStepsXml([])).toBe('<steps id="0" last="1"></steps>');
    });

    it('encodes ValidateStep and ActionStep with sequential IDs starting at 2 and XML escaping', () => {
      const xml = formatTestStepsXml([
        {
          action: 'Open <login> & click "Sign in"',
          expectedResult: 'User sees "Home" & status > 0',
        },
        {
          action: "Click 'Logout'",
        },
      ]);

      expect(xml).toContain('<steps id="0" last="3">');
      expect(xml).toContain('<step id="2" type="ValidateStep">');
      expect(xml).toContain(
        '&lt;P&gt;Open &amp;lt;login&amp;gt; &amp;amp; click &amp;quot;Sign in&amp;quot;&lt;/P&gt;',
      );
      expect(xml).toContain(
        '&lt;P&gt;User sees &amp;quot;Home&amp;quot; &amp;amp; status &amp;gt; 0&lt;/P&gt;',
      );
      expect(xml).toContain('<step id="3" type="ActionStep">');
      expect(xml).toContain(
        '<parameterizedString isformatted="true"></parameterizedString>',
      );
    });
  });

  describe('extractContinuationToken & fetchPagedTestPlanCollection', () => {
    it('extracts continuation token case-insensitively', () => {
      expect(
        extractContinuationToken({ 'x-ms-continuationtoken': 'tok-1' }),
      ).toBe('tok-1');
      expect(
        extractContinuationToken({ 'X-MS-ContinuationToken': ' tok-2 ' }),
      ).toBe('tok-2');
      expect(
        extractContinuationToken({ 'x-ms-continuationtoken': '  ' }),
      ).toBeUndefined();
      expect(extractContinuationToken(undefined)).toBeUndefined();
    });

    it('uses vsoClient + rest.get to capture continuation token header', async () => {
      const getVersioningData = jest.fn().mockResolvedValue({
        requestUrl: 'https://dev.azure.com/org/proj/_apis/testplan/plans',
        apiVersion: '7.1',
      });
      const createRequestOptions = jest
        .fn()
        .mockReturnValue({ acceptHeader: 'application/json' });
      const restGet = jest.fn().mockResolvedValue({
        result: { value: [{ id: 10, name: 'Sprint 1' }] },
        headers: { 'x-ms-continuationtoken': 'next-page-token' },
      });
      const formatResponse = jest
        .fn()
        .mockReturnValue([{ id: 10, name: 'Sprint 1' }]);

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
        fallback: jest.fn(),
      });

      expect(getVersioningData).toHaveBeenCalledWith(
        '7.2-preview.1',
        'testplan',
        TEST_PLANS_LOCATION_ID,
        { project: 'proj' },
        { filterActivePlans: true },
      );
      expect(result).toEqual({
        items: [{ id: 10, name: 'Sprint 1' }],
        continuationToken: 'next-page-token',
      });
    });

    it('falls back to SDK method when vsoClient/rest are absent', async () => {
      const items = Object.assign([{ id: 1 }], { continuationToken: 'fb-tok' });
      const result = await fetchPagedTestPlanCollection({
        testPlanApi: {},
        apiVersion: '7.2-preview.1',
        locationId: TEST_PLANS_LOCATION_ID,
        routeValues: { project: 'proj' },
        queryParams: {},
        typeInfo: {},
        fallback: jest.fn().mockResolvedValue(items),
      });

      expect(result).toEqual({
        items: [{ id: 1 }],
        continuationToken: 'fb-tok',
      });
    });

    it('throws AzureDevOpsResourceNotFoundError when rest.get resolves with statusCode 404', async () => {
      await expect(
        fetchPagedTestPlanCollection({
          testPlanApi: {
            vsoClient: {
              getVersioningData: jest.fn().mockResolvedValue({
                requestUrl:
                  'https://dev.azure.com/org/missing/_apis/testplan/plans',
                apiVersion: '7.1',
              }),
            },
            createRequestOptions: jest.fn().mockReturnValue({}),
            rest: {
              get: jest.fn().mockResolvedValue({
                statusCode: 404,
                result: null,
                headers: {},
              }),
            },
          },
          apiVersion: '7.2-preview.1',
          locationId: TEST_PLANS_LOCATION_ID,
          routeValues: { project: 'missing' },
          queryParams: {},
          typeInfo: {},
          fallback: jest.fn(),
        }),
      ).rejects.toThrow(AzureDevOpsResourceNotFoundError);
    });
  });

  describe('parseStrictIsoDate & isValidIsoDateString', () => {
    it('accepts valid ISO 8601 dates and date-times with timezone offsets', () => {
      const d1 = parseStrictIsoDate('2026-06-01');
      expect(d1?.toISOString()).toBe('2026-06-01T00:00:00.000Z');

      const leapDay = parseStrictIsoDate('2024-02-29');
      expect(leapDay?.toISOString()).toBe('2024-02-29T00:00:00.000Z');

      const utcDateTime = parseStrictIsoDate('2026-06-01T12:30:45.123Z');
      expect(utcDateTime?.toISOString()).toBe('2026-06-01T12:30:45.123Z');

      const offsetDateTime = parseStrictIsoDate('2026-06-01T14:30:00+02:00');
      expect(offsetDateTime?.toISOString()).toBe('2026-06-01T12:30:00.000Z');

      expect(isValidIsoDateString('2026-06-01')).toBe(true);
      expect(isValidIsoDateString('2026-06-01T00:00:00Z')).toBe(true);
    });

    it('rejects impossible calendar dates and non-ISO strings', () => {
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
        expect(parseStrictIsoDate(input)).toBeNull();
        expect(isValidIsoDateString(input)).toBe(false);
      }
    });
  });

  describe('mapTestPlanError', () => {
    it('maps HTTP status codes to typed AzureDevOpsError subclasses', () => {
      expect(() =>
        mapTestPlanError(
          Object.assign(new Error('bad'), { statusCode: 400 }),
          'ctx',
        ),
      ).toThrow(AzureDevOpsValidationError);
      expect(() =>
        mapTestPlanError(
          Object.assign(new Error('unauth'), { statusCode: 401 }),
          'ctx',
        ),
      ).toThrow(AzureDevOpsAuthenticationError);
      expect(() =>
        mapTestPlanError(
          Object.assign(new Error('denied'), { statusCode: 403 }),
          'ctx',
        ),
      ).toThrow(AzureDevOpsPermissionError);
      expect(() =>
        mapTestPlanError(
          Object.assign(new Error('missing'), { statusCode: 404 }),
          'ctx',
        ),
      ).toThrow(AzureDevOpsResourceNotFoundError);
      expect(() => mapTestPlanError(new Error('boom'), 'ctx')).toThrow(
        AzureDevOpsError,
      );
    });

    it('tailors 403 permission guidance to test-read, test-write, and work-item-write scopes', () => {
      const err403 = Object.assign(new Error('Forbidden'), { statusCode: 403 });

      expect(() => mapTestPlanError(err403, 'read', 'test-read')).toThrow(
        /vso\.test\)/,
      );
      expect(() => mapTestPlanError(err403, 'read', 'test-read')).not.toThrow(
        /Basic \+ Test Plans/,
      );

      expect(() => mapTestPlanError(err403, 'write', 'test-write')).toThrow(
        /vso\.test_write.*Basic \+ Test Plans/,
      );

      expect(() => mapTestPlanError(err403, 'wit', 'work-item-write')).toThrow(
        /vso\.work_write/,
      );
      expect(() =>
        mapTestPlanError(err403, 'wit', 'work-item-write'),
      ).not.toThrow(/Basic \+ Test Plans/);
    });

    it('rethrows existing AzureDevOpsError instances unchanged', () => {
      const existing = new AzureDevOpsValidationError('already typed');
      expect(() => mapTestPlanError(existing, 'ctx')).toThrow(existing);
    });
  });
});
