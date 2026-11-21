import { WebApi } from 'azure-devops-node-api';
import {
  TestPlan,
  TestPlanCreateParams,
  TypeInfo,
} from 'azure-devops-node-api/interfaces/TestPlanInterfaces';
import {
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../../../shared/errors';
import {
  fetchPagedTestPlanCollection,
  mapTestPlanError,
  resolveProjectId,
  TEST_PLANS_LOCATION_ID,
} from '../helpers';
import {
  CreateTestPlanOptions,
  GetTestPlanOptions,
  ListTestPlansOptions,
  ListTestPlansResponse,
} from '../types';

/**
 * List test plans in a project with optional filters and continuation token pagination.
 */
export async function listTestPlans(
  connection: WebApi,
  options: ListTestPlansOptions = {},
): Promise<ListTestPlansResponse> {
  try {
    const project = resolveProjectId(options.projectId);
    const testPlanApi = await connection.getTestPlanApi();

    const { items, continuationToken } =
      await fetchPagedTestPlanCollection<TestPlan>({
        testPlanApi,
        apiVersion: '7.2-preview.1',
        locationId: TEST_PLANS_LOCATION_ID,
        routeValues: { project },
        queryParams: {
          owner: options.owner,
          continuationToken: options.continuationToken,
          includePlanDetails: options.includePlanDetails,
          filterActivePlans: options.filterActivePlans,
        },
        typeInfo: TypeInfo.TestPlan,
        fallback: () =>
          testPlanApi.getTestPlans(
            project,
            options.owner,
            options.continuationToken,
            options.includePlanDetails,
            options.filterActivePlans,
          ),
      });

    return {
      testPlans: items,
      ...(continuationToken ? { continuationToken } : {}),
    };
  } catch (error) {
    mapTestPlanError(error, 'Failed to list test plans');
  }
}

/**
 * Get a single test plan by ID (including rootSuite metadata).
 */
export async function getTestPlan(
  connection: WebApi,
  options: GetTestPlanOptions,
): Promise<TestPlan> {
  try {
    const project = resolveProjectId(options.projectId);
    const testPlanApi = await connection.getTestPlanApi();

    const plan = await testPlanApi.getTestPlanById(project, options.planId);
    if (!plan) {
      throw new AzureDevOpsResourceNotFoundError(
        `Test plan ${options.planId} not found in project '${project}'`,
      );
    }
    return plan;
  } catch (error) {
    mapTestPlanError(error, `Failed to get test plan ${options.planId}`);
  }
}

/**
 * Create a new test plan in a project.
 */
export async function createTestPlan(
  connection: WebApi,
  options: CreateTestPlanOptions,
): Promise<TestPlan> {
  try {
    const project = resolveProjectId(options.projectId);
    const name = options.name?.trim();
    if (!name) {
      throw new AzureDevOpsValidationError('Test plan name is required');
    }

    if (
      options.startDate &&
      options.endDate &&
      Date.parse(options.endDate) < Date.parse(options.startDate)
    ) {
      throw new AzureDevOpsValidationError(
        'endDate must be on or after startDate',
      );
    }

    const testPlanApi = await connection.getTestPlanApi();
    const createParams: TestPlanCreateParams = {
      name,
      iteration: options.iteration?.trim() || project,
      ...(options.areaPath ? { areaPath: options.areaPath } : {}),
      ...(options.description !== undefined
        ? { description: options.description }
        : {}),
      ...(options.startDate ? { startDate: new Date(options.startDate) } : {}),
      ...(options.endDate ? { endDate: new Date(options.endDate) } : {}),
      ...(options.state ? { state: options.state } : {}),
      ...(options.ownerId ? { owner: { id: options.ownerId } } : {}),
      ...(options.buildId !== undefined ? { buildId: options.buildId } : {}),
    };

    const created = await testPlanApi.createTestPlan(createParams, project);
    if (!created) {
      throw new Error('Azure DevOps returned an empty response');
    }
    return created;
  } catch (error) {
    mapTestPlanError(error, `Failed to create test plan '${options.name}'`);
  }
}
