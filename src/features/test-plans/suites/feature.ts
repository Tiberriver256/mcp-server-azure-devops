import { WebApi } from 'azure-devops-node-api';
import {
  TestSuite,
  TestSuiteCreateParams,
  TypeInfo,
} from 'azure-devops-node-api/interfaces/TestPlanInterfaces';
import {
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../../../shared/errors';
import {
  fetchPagedTestPlanCollection,
  mapSuiteExpand,
  mapSuiteType,
  mapTestPlanError,
  resolveProjectId,
  TEST_SUITES_LOCATION_ID,
} from '../helpers';
import {
  CreateTestSuiteOptions,
  GetTestSuiteOptions,
  ListTestSuitesOptions,
  ListTestSuitesResponse,
} from '../types';

/**
 * List test suites for a test plan (flat or tree view) with continuation token pagination.
 */
export async function listTestSuites(
  connection: WebApi,
  options: ListTestSuitesOptions,
): Promise<ListTestSuitesResponse> {
  try {
    const project = resolveProjectId(options.projectId);
    const testPlanApi = await connection.getTestPlanApi();
    const expandEnum = mapSuiteExpand(options.expand);

    const { items, continuationToken } =
      await fetchPagedTestPlanCollection<TestSuite>({
        testPlanApi,
        apiVersion: '7.2-preview.1',
        locationId: TEST_SUITES_LOCATION_ID,
        routeValues: { project, planId: options.planId },
        queryParams: {
          expand: expandEnum,
          continuationToken: options.continuationToken,
          asTreeView: options.asTreeView,
        },
        typeInfo: TypeInfo.TestSuite,
        fallback: () =>
          testPlanApi.getTestSuitesForPlan(
            project,
            options.planId,
            expandEnum,
            options.continuationToken,
            options.asTreeView,
          ),
      });

    return {
      testSuites: items,
      ...(continuationToken ? { continuationToken } : {}),
    };
  } catch (error) {
    mapTestPlanError(
      error,
      `Failed to list test suites for plan ${options.planId}`,
    );
  }
}

/**
 * Get a single test suite by plan ID and suite ID.
 */
export async function getTestSuite(
  connection: WebApi,
  options: GetTestSuiteOptions,
): Promise<TestSuite> {
  try {
    const project = resolveProjectId(options.projectId);
    const testPlanApi = await connection.getTestPlanApi();
    const expandEnum = mapSuiteExpand(options.expand);

    const suite = await testPlanApi.getTestSuiteById(
      project,
      options.planId,
      options.suiteId,
      expandEnum,
    );
    if (!suite) {
      throw new AzureDevOpsResourceNotFoundError(
        `Test suite ${options.suiteId} not found in plan ${options.planId}`,
      );
    }
    return suite;
  } catch (error) {
    mapTestPlanError(
      error,
      `Failed to get test suite ${options.suiteId} in plan ${options.planId}`,
    );
  }
}

/**
 * Create a static, requirement-based, or query-based test suite under a test plan.
 * When parentSuiteId is omitted, automatically resolves and uses the plan's rootSuite.id.
 */
export async function createTestSuite(
  connection: WebApi,
  options: CreateTestSuiteOptions,
): Promise<TestSuite> {
  try {
    const project = resolveProjectId(options.projectId);
    const name = options.name?.trim();
    if (!name) {
      throw new AzureDevOpsValidationError('Test suite name is required');
    }

    const suiteTypeOpt = options.suiteType ?? 'staticTestSuite';
    if (
      suiteTypeOpt === 'requirementTestSuite' &&
      options.requirementId === undefined
    ) {
      throw new AzureDevOpsValidationError(
        'requirementId is required when suiteType is "requirementTestSuite"',
      );
    }
    if (suiteTypeOpt === 'dynamicTestSuite' && !options.queryString?.trim()) {
      throw new AzureDevOpsValidationError(
        'queryString is required when suiteType is "dynamicTestSuite"',
      );
    }

    const testPlanApi = await connection.getTestPlanApi();

    let parentSuiteId = options.parentSuiteId;
    let parentSuiteName = '';
    if (parentSuiteId === undefined) {
      const plan = await testPlanApi.getTestPlanById(project, options.planId);
      if (!plan?.rootSuite?.id) {
        throw new AzureDevOpsResourceNotFoundError(
          `Unable to resolve rootSuite for test plan ${options.planId} in project '${project}'`,
        );
      }
      parentSuiteId = plan.rootSuite.id;
      parentSuiteName = plan.rootSuite.name ?? '';
    }

    const createParams: TestSuiteCreateParams = {
      name,
      suiteType: mapSuiteType(suiteTypeOpt),
      parentSuite: { id: parentSuiteId, name: parentSuiteName },
      ...(options.requirementId !== undefined
        ? { requirementId: options.requirementId }
        : {}),
      ...(options.queryString?.trim()
        ? { queryString: options.queryString.trim() }
        : {}),
      ...(options.inheritDefaultConfigurations !== undefined
        ? {
            inheritDefaultConfigurations: options.inheritDefaultConfigurations,
          }
        : {}),
    };

    const created = await testPlanApi.createTestSuite(
      createParams,
      project,
      options.planId,
    );
    if (!created) {
      throw new Error('Azure DevOps returned an empty response');
    }
    return created;
  } catch (error) {
    mapTestPlanError(
      error,
      `Failed to create test suite '${options.name}' in plan ${options.planId}`,
    );
  }
}
