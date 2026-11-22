import { WebApi } from 'azure-devops-node-api';
import {
  SuiteTestCaseCreateUpdateParameters,
  TestCase,
  TypeInfo,
} from 'azure-devops-node-api/interfaces/TestPlanInterfaces';
import {
  AzureDevOpsError,
  AzureDevOpsValidationError,
} from '../../../shared/errors';
import {
  deduplicateIds,
  fetchPagedTestPlanCollection,
  formatTestStepsXml,
  mapTestPlanError,
  resolveProjectId,
  SUITE_TEST_CASES_LOCATION_ID,
} from '../helpers';
import {
  AddTestCasesToSuiteOptions,
  CreateTestCaseOptions,
  CreateTestCaseResponse,
  ListSuiteTestCasesOptions,
  ListSuiteTestCasesResponse,
  RemoveTestCasesFromSuiteOptions,
  RemoveTestCasesFromSuiteResponse,
} from '../types';

/**
 * List test cases linked to a specific test suite with optional filters and pagination.
 */
export async function listSuiteTestCases(
  connection: WebApi,
  options: ListSuiteTestCasesOptions,
): Promise<ListSuiteTestCasesResponse> {
  try {
    const project = resolveProjectId(options.projectId);
    const testPlanApi = await connection.getTestPlanApi();

    const testIdsParam =
      options.testIds && options.testIds.length > 0
        ? deduplicateIds(options.testIds).join(',')
        : undefined;
    const configIdsParam =
      options.configurationIds && options.configurationIds.length > 0
        ? deduplicateIds(options.configurationIds).join(',')
        : undefined;
    const witFieldsParam =
      options.witFields && options.witFields.length > 0
        ? options.witFields.join(',')
        : undefined;
    // Only send isRecursive when explicitly true for Azure DevOps Server 2020/2022 compatibility
    const isRecursiveParam = options.isRecursive === true ? true : undefined;

    const { items, continuationToken } =
      await fetchPagedTestPlanCollection<TestCase>({
        testPlanApi,
        apiVersion: '7.2-preview.3',
        locationId: SUITE_TEST_CASES_LOCATION_ID,
        routeValues: {
          project,
          planId: options.planId,
          suiteId: options.suiteId,
        },
        queryParams: {
          testIds: testIdsParam,
          configurationIds: configIdsParam,
          witFields: witFieldsParam,
          continuationToken: options.continuationToken,
          expand: options.expand,
          isRecursive: isRecursiveParam,
        },
        typeInfo: TypeInfo.TestCase,
        fallback: () =>
          testPlanApi.getTestCaseList(
            project,
            options.planId,
            options.suiteId,
            testIdsParam,
            configIdsParam,
            witFieldsParam,
            options.continuationToken,
            undefined,
            options.expand,
            undefined,
            isRecursiveParam,
          ),
      });

    return {
      testCases: items,
      ...(continuationToken ? { continuationToken } : {}),
    };
  } catch (error) {
    mapTestPlanError(
      error,
      `Failed to list test cases in plan ${options.planId}, suite ${options.suiteId}`,
    );
  }
}

/**
 * Add one or more existing Test Case work items to a static or requirement-based test suite.
 */
export async function addTestCasesToSuite(
  connection: WebApi,
  options: AddTestCasesToSuiteOptions,
): Promise<TestCase[]> {
  try {
    const project = resolveProjectId(options.projectId);
    const uniqueIds = deduplicateIds(options.testCaseIds);
    if (uniqueIds.length === 0) {
      throw new AzureDevOpsValidationError(
        'At least one testCaseId is required',
      );
    }

    const pointAssignments =
      options.configurationIds && options.configurationIds.length > 0
        ? deduplicateIds(options.configurationIds).map((configurationId) => ({
            configurationId,
          }))
        : undefined;

    const payload: SuiteTestCaseCreateUpdateParameters[] = uniqueIds.map(
      (id) => ({
        workItem: { id },
        ...(pointAssignments ? { pointAssignments } : {}),
      }),
    );

    const testPlanApi = await connection.getTestPlanApi();
    const added = await testPlanApi.addTestCasesToSuite(
      payload,
      project,
      options.planId,
      options.suiteId,
    );

    return Array.isArray(added) ? added : [];
  } catch (error) {
    mapTestPlanError(
      error,
      `Failed to add test cases to plan ${options.planId}, suite ${options.suiteId}`,
      'test-write',
    );
  }
}

/**
 * Remove one or more test cases from a static test suite (does not delete the Test Case work items).
 */
export async function removeTestCasesFromSuite(
  connection: WebApi,
  options: RemoveTestCasesFromSuiteOptions,
): Promise<RemoveTestCasesFromSuiteResponse> {
  try {
    const project = resolveProjectId(options.projectId);
    const uniqueIds = deduplicateIds(options.testCaseIds);
    if (uniqueIds.length === 0) {
      throw new AzureDevOpsValidationError(
        'At least one testCaseId is required',
      );
    }

    const testPlanApi = await connection.getTestPlanApi();
    await testPlanApi.removeTestCasesFromSuite(
      project,
      options.planId,
      options.suiteId,
      uniqueIds.join(','),
    );

    return {
      planId: options.planId,
      suiteId: options.suiteId,
      removedTestCaseIds: uniqueIds,
    };
  } catch (error) {
    mapTestPlanError(
      error,
      `Failed to remove test cases from plan ${options.planId}, suite ${options.suiteId}`,
      'test-write',
    );
  }
}

/**
 * Create a Test Case work item with structured steps XML, optional TestedBy requirement link,
 * and optional immediate attachment to a test suite.
 */
export async function createTestCase(
  connection: WebApi,
  options: CreateTestCaseOptions,
): Promise<CreateTestCaseResponse> {
  try {
    const project = resolveProjectId(options.projectId);
    const title = options.title?.trim();
    if (!title) {
      throw new AzureDevOpsValidationError('Test case title is required');
    }

    const hasPlan = options.planId !== undefined;
    const hasSuite = options.suiteId !== undefined;
    if (hasPlan !== hasSuite) {
      throw new AzureDevOpsValidationError(
        'planId and suiteId must both be provided to attach the Test Case to a suite',
      );
    }
    if (options.configurationIds !== undefined && (!hasPlan || !hasSuite)) {
      throw new AzureDevOpsValidationError(
        'configurationIds requires both planId and suiteId',
      );
    }

    const document: Array<{ op: string; path: string; value: unknown }> = [
      {
        op: 'add',
        path: '/fields/System.Title',
        value: title,
      },
    ];

    if (options.description !== undefined) {
      document.push({
        op: 'add',
        path: '/fields/System.Description',
        value: options.description,
      });
    }

    if (options.steps && options.steps.length > 0) {
      document.push({
        op: 'add',
        path: '/fields/Microsoft.VSTS.TCM.Steps',
        value: formatTestStepsXml(options.steps),
      });
    }

    if (options.priority !== undefined) {
      document.push({
        op: 'add',
        path: '/fields/Microsoft.VSTS.Common.Priority',
        value: options.priority,
      });
    }

    if (options.areaPath) {
      document.push({
        op: 'add',
        path: '/fields/System.AreaPath',
        value: options.areaPath,
      });
    }

    if (options.iterationPath) {
      document.push({
        op: 'add',
        path: '/fields/System.IterationPath',
        value: options.iterationPath,
      });
    }

    if (options.assignedTo) {
      document.push({
        op: 'add',
        path: '/fields/System.AssignedTo',
        value: options.assignedTo,
      });
    }

    if (options.tags && options.tags.length > 0) {
      document.push({
        op: 'add',
        path: '/fields/System.Tags',
        value: options.tags.join('; '),
      });
    }

    if (options.requirementId !== undefined) {
      const baseServerUrl = (connection.serverUrl || '').replace(/\/+$/, '');
      document.push({
        op: 'add',
        path: '/relations/-',
        value: {
          rel: 'Microsoft.VSTS.Common.TestedBy-Reverse',
          url: `${baseServerUrl}/_apis/wit/workItems/${options.requirementId}`,
        },
      });
    }

    const witApi = await connection.getWorkItemTrackingApi();
    const workItem = await witApi.createWorkItem(
      null,
      document,
      project,
      'Test Case',
    );

    if (!workItem || typeof workItem.id !== 'number') {
      throw new Error('Failed to create Test Case work item');
    }

    if (options.planId !== undefined && options.suiteId !== undefined) {
      try {
        const suiteAssignment = await addTestCasesToSuite(connection, {
          projectId: project,
          planId: options.planId,
          suiteId: options.suiteId,
          testCaseIds: [workItem.id],
          configurationIds: options.configurationIds,
        });
        return { workItem, suiteAssignment };
      } catch (attachError) {
        const attachMsg =
          attachError instanceof Error
            ? attachError.message
            : String(attachError);
        const partialMessage =
          `Test Case work item ${workItem.id} was created, but attaching it to plan ${options.planId}, suite ${options.suiteId} failed: ${attachMsg}. ` +
          'You can attach it using add_test_cases_to_suite.';

        if (attachError instanceof AzureDevOpsError) {
          const ErrorCtor = attachError.constructor as new (
            msg: string,
          ) => AzureDevOpsError;
          throw new ErrorCtor(partialMessage);
        }
        throw new AzureDevOpsError(partialMessage);
      }
    }

    return { workItem };
  } catch (error) {
    mapTestPlanError(
      error,
      `Failed to create test case '${options.title}'`,
      'work-item-write',
    );
  }
}
