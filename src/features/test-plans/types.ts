import type {
  TestCase,
  TestPlan,
  TestSuite,
} from 'azure-devops-node-api/interfaces/TestPlanInterfaces.js';
import type { WorkItem } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces.js';

export type SuiteExpandOption = 'none' | 'children' | 'defaultTesters';

export type TestSuiteTypeOption =
  | 'staticTestSuite'
  | 'requirementTestSuite'
  | 'dynamicTestSuite';

export interface ListTestPlansOptions {
  projectId?: string;
  owner?: string;
  filterActivePlans?: boolean;
  includePlanDetails?: boolean;
  continuationToken?: string;
}

export interface ListTestPlansResponse {
  testPlans: TestPlan[];
  continuationToken?: string;
}

export interface GetTestPlanOptions {
  projectId?: string;
  planId: number;
}

export interface CreateTestPlanOptions {
  projectId?: string;
  name: string;
  iteration?: string;
  areaPath?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  state?: string;
  ownerId?: string;
  buildId?: number;
}

export interface ListTestSuitesOptions {
  projectId?: string;
  planId: number;
  expand?: SuiteExpandOption;
  asTreeView?: boolean;
  continuationToken?: string;
}

export interface ListTestSuitesResponse {
  testSuites: TestSuite[];
  continuationToken?: string;
}

export interface GetTestSuiteOptions {
  projectId?: string;
  planId: number;
  suiteId: number;
  expand?: SuiteExpandOption;
}

export interface CreateTestSuiteOptions {
  projectId?: string;
  planId: number;
  name: string;
  suiteType?: TestSuiteTypeOption;
  parentSuiteId?: number;
  requirementId?: number;
  queryString?: string;
  inheritDefaultConfigurations?: boolean;
}

export interface ListSuiteTestCasesOptions {
  projectId?: string;
  planId: number;
  suiteId: number;
  testIds?: number[];
  configurationIds?: number[];
  witFields?: string[];
  expand?: boolean;
  isRecursive?: boolean;
  continuationToken?: string;
}

export interface ListSuiteTestCasesResponse {
  testCases: TestCase[];
  continuationToken?: string;
}

export interface AddTestCasesToSuiteOptions {
  projectId?: string;
  planId: number;
  suiteId: number;
  testCaseIds: number[];
  configurationIds?: number[];
}

export interface RemoveTestCasesFromSuiteOptions {
  projectId?: string;
  planId: number;
  suiteId: number;
  testCaseIds: number[];
}

export interface RemoveTestCasesFromSuiteResponse {
  planId: number;
  suiteId: number;
  removedTestCaseIds: number[];
}

export interface TestCaseStepInput {
  action: string;
  expectedResult?: string;
}

export interface CreateTestCaseOptions {
  projectId?: string;
  title: string;
  description?: string;
  steps?: TestCaseStepInput[];
  priority?: number;
  areaPath?: string;
  iterationPath?: string;
  assignedTo?: string;
  tags?: string[];
  requirementId?: number;
  planId?: number;
  suiteId?: number;
  configurationIds?: number[];
}

export interface CreateTestCaseResponse {
  workItem: WorkItem;
  suiteAssignment?: TestCase[];
}

export type { TestCase, TestPlan, TestSuite };
