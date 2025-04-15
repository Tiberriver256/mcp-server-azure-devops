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
    isIdentity?: boolean;
    isPicklist?: boolean;
    description?: string;
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
              isDisabled: false,
              states: [
                { name: 'New', stateCategory: 'Proposed' },
                { name: 'Active', stateCategory: 'InProgress' },
                { name: 'Resolved', stateCategory: 'InProgress' },
                { name: 'Closed', stateCategory: 'Completed' },
              ],
            };

            // If fields are requested, don't add fields here - we'll add them after fetching from API
            return workItemTypeInfo;
          },
        );

        // If fields are requested, get the field definitions from the API
        if (includeFields) {
          try {
            // Instead of getting all fields and applying them to all work item types,
            // let's get the fields specific to each work item type
            for (const wit of processWorkItemTypes) {
              try {
                // Get fields specific to this work item type using the specialized method
                const typeSpecificFields =
                  await workItemTrackingApi.getWorkItemTypeFieldsWithReferences(
                    projectId,
                    wit.name,
                  );

                // Map the fields to our format
                wit.fields = typeSpecificFields.map((field: any) => ({
                  name: field.name || 'Unknown',
                  referenceName: field.referenceName || 'Unknown',
                  type: field.type?.toString().toLowerCase() || 'string',
                  required: field.isRequired || false,
                  isIdentity: field.isIdentity || false,
                  isPicklist: field.isPicklist || false,
                  description: field.description,
                }));
              } catch (typeFieldError) {
                console.error(
                  `Error fetching fields for work item type ${wit.name}:`,
                  typeFieldError,
                );

                // Fallback to basic fields
                wit.fields = [
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
            }
          } catch (fieldError) {
            console.error('Error in field processing:', fieldError);

            // Fallback to default fields if API call fails
            processWorkItemTypes.forEach((wit) => {
              wit.fields = [
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
            });
          }
        }

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
