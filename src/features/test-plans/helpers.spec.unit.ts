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
  mapSuiteExpand,
  mapSuiteType,
  mapTestPlanError,
  resolveProjectId,
  TEST_PLANS_LOCATION_ID,
} from './helpers';

describe('test-plans helpers', () => {
  describe('resolveProjectId', () => {
    it('returns trimmed explicit projectId', () => {
      expect(resolveProjectId('  MyProject  ')).toBe('MyProject');
    });

    it('throws AzureDevOpsValidationError when projectId is omitted and no default project is set', async () => {
      const orig = process.env.AZURE_DEVOPS_DEFAULT_PROJECT;
      delete process.env.AZURE_DEVOPS_DEFAULT_PROJECT;
      try {
        jest.resetModules();
        const mod = await import('./helpers');
        const errorsMod = await import('../../shared/errors');
        expect(() => mod.resolveProjectId(undefined)).toThrow(
          errorsMod.AzureDevOpsValidationError,
        );
      } finally {
        if (orig !== undefined) {
          process.env.AZURE_DEVOPS_DEFAULT_PROJECT = orig;
        }
        jest.resetModules();
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

    it('rethrows existing AzureDevOpsError instances unchanged', () => {
      const existing = new AzureDevOpsValidationError('already typed');
      expect(() => mapTestPlanError(existing, 'ctx')).toThrow(existing);
    });
  });
});
