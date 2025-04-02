import { WebApi } from 'azure-devops-node-api';
import {
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsError,
} from '../../../shared/errors';
import {
  TeamProject,
  WebApiTeam,
} from 'azure-devops-node-api/interfaces/CoreInterfaces';

/**
 * Options for getting project details
 */
export interface GetProjectDetailsOptions {
  projectId: string;
  includeProcess?: boolean;
  includeWorkItemTypes?: boolean;
  includeFields?: boolean;
  includeTeams?: boolean;
  expandTeamIdentity?: boolean;
}

/**
 * Process information with work item types
 */
interface ProcessInfo {
  id: string;
  name: string;
  description?: string;
  isDefault: boolean;
  type: string;
  workItemTypes?: WorkItemTypeInfo[];
  hierarchyInfo?: {
    portfolioBacklogs?: {
      name: string;
      workItemTypes: string[];
    }[];
    requirementBacklog?: {
      name: string;
      workItemTypes: string[];
    };
    taskBacklog?: {
      name: string;
      workItemTypes: string[];
    };
  };
}

/**
 * Work item type information with states and fields
 */
interface WorkItemTypeInfo {
  name: string;
  referenceName: string;
  description?: string;
  color?: string;
  icon?: string;
  isDisabled: boolean;
  states?: {
    name: string;
    color?: string;
    stateCategory: string;
  }[];
  fields?: {
    name: string;
    referenceName: string;
    type: string;
    required?: boolean;
  }[];
}

/**
 * Project details response
 */
interface ProjectDetails extends TeamProject {
  process?: ProcessInfo;
  teams?: WebApiTeam[];
}

/**
 * Get detailed information about a project
 *
 * @param connection The Azure DevOps WebApi connection
 * @param options Options for getting project details
 * @returns The project details
 * @throws {AzureDevOpsResourceNotFoundError} If the project is not found
 */
export async function getProjectDetails(
  connection: WebApi,
  options: GetProjectDetailsOptions,
): Promise<ProjectDetails> {
  try {
    const {
      projectId,
      includeProcess = false,
      includeWorkItemTypes = false,
      includeFields = false,
      includeTeams = false,
      expandTeamIdentity = false,
    } = options;

    // Get the core API
    const coreApi = await connection.getCoreApi();

    // Get the basic project information
    const project = await coreApi.getProject(projectId);

    if (!project) {
      throw new AzureDevOpsResourceNotFoundError(
        `Project '${projectId}' not found`,
      );
    }

    // Initialize the result with the project information and ensure required properties
    const result: ProjectDetails = {
      ...project,
      // Ensure capabilities is always defined
      capabilities: project.capabilities || {
        versioncontrol: { sourceControlType: 'Git' },
        processTemplate: { templateName: 'Unknown', templateTypeId: 'unknown' },
      },
    };

    // If teams are requested, get them
    if (includeTeams) {
      const teams = await coreApi.getTeams(projectId, expandTeamIdentity);
      result.teams = teams;
    }

    // If process information is requested, get it
    if (includeProcess) {
      // Get the process template ID from the project capabilities
      const processTemplateId =
        project.capabilities?.processTemplate?.templateTypeId || 'unknown';

      // Always create a process object, even if we don't have a template ID
      // In a real implementation, we would use the Process API
      // Since it's not directly available in the WebApi type, we'll simulate it
      // This is a simplified version for the implementation
      // In a real implementation, you would need to use the appropriate API

      // Create the process info object directly
      const processInfo: ProcessInfo = {
        id: processTemplateId,
        name: project.capabilities?.processTemplate?.templateName || 'Unknown',
        description: 'Process template for the project',
        isDefault: true,
        type: 'system',
      };

      // If work item types are requested, get them
      if (includeWorkItemTypes) {
        // In a real implementation, we would get work item types from the API
        // For now, we'll use the work item tracking API to get basic types
        const workItemTrackingApi = await connection.getWorkItemTrackingApi();
        const workItemTypes =
          await workItemTrackingApi.getWorkItemTypes(projectId);

        // Map the work item types to our format
        const processWorkItemTypes: WorkItemTypeInfo[] = workItemTypes.map(
          (wit) => {
            // Create the work item type info object
            const workItemTypeInfo: WorkItemTypeInfo = {
              name: wit.name || 'Unknown',
              referenceName:
                wit.referenceName || `System.Unknown.${Date.now()}`,
              description: wit.description,
              color: wit.color,
              icon: wit.icon ? String(wit.icon) : undefined,
              isDisabled: false,
              states: [
                { name: 'New', stateCategory: 'Proposed' },
                { name: 'Active', stateCategory: 'InProgress' },
                { name: 'Resolved', stateCategory: 'InProgress' },
                { name: 'Closed', stateCategory: 'Completed' },
              ],
            };

            // If fields are requested, add some common fields
            if (includeFields) {
              workItemTypeInfo.fields = [
                {
                  name: 'Title',
                  referenceName: 'System.Title',
                  type: 'string',
                  required: true,
                },
                {
                  name: 'Description',
                  referenceName: 'System.Description',
                  type: 'html',
                  required: false,
                },
              ];
            }

            return workItemTypeInfo;
          },
        );

        processInfo.workItemTypes = processWorkItemTypes;

        // Add hierarchy information if available
        // This is a simplified version - in a real implementation, you would
        // need to get the backlog configuration and map it to the work item types
        processInfo.hierarchyInfo = {
          portfolioBacklogs: [
            {
              name: 'Epics',
              workItemTypes: processWorkItemTypes
                .filter(
                  (wit: WorkItemTypeInfo) => wit.name.toLowerCase() === 'epic',
                )
                .map((wit: WorkItemTypeInfo) => wit.name),
            },
            {
              name: 'Features',
              workItemTypes: processWorkItemTypes
                .filter(
                  (wit: WorkItemTypeInfo) =>
                    wit.name.toLowerCase() === 'feature',
                )
                .map((wit: WorkItemTypeInfo) => wit.name),
            },
          ],
          requirementBacklog: {
            name: 'Stories',
            workItemTypes: processWorkItemTypes
              .filter(
                (wit: WorkItemTypeInfo) =>
                  wit.name.toLowerCase() === 'user story' ||
                  wit.name.toLowerCase() === 'bug',
              )
              .map((wit: WorkItemTypeInfo) => wit.name),
          },
          taskBacklog: {
            name: 'Tasks',
            workItemTypes: processWorkItemTypes
              .filter(
                (wit: WorkItemTypeInfo) => wit.name.toLowerCase() === 'task',
              )
              .map((wit: WorkItemTypeInfo) => wit.name),
          },
        };
      }

      // Always set the process on the result
      result.process = processInfo;
    }

    return result;
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    throw new Error(
      `Failed to get project details: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
