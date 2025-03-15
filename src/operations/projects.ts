import { z } from 'zod';
import { WebApi } from 'azure-devops-node-api';
import { TeamProject } from 'azure-devops-node-api/interfaces/CoreInterfaces';
import { AzureDevOpsResourceNotFoundError } from '../common/errors';

/**
 * Schema for getting a project
 */
export const GetProjectSchema = z.object({
  projectId: z.string().describe("The ID or name of the project")
});

/**
 * Schema for listing projects
 */
export const ListProjectsSchema = z.object({
  stateFilter: z.number().optional().describe("Filter on team project state (0: all, 1: well-formed, 2: creating, 3: deleting, 4: new)"),
  top: z.number().optional().describe("Maximum number of projects to return"),
  skip: z.number().optional().describe("Number of projects to skip"),
  continuationToken: z.number().optional().describe("Gets the projects after the continuation token provided")
});

/**
 * Get a project by ID or name
 * 
 * @param connection The Azure DevOps WebApi connection
 * @param projectId The ID or name of the project
 * @returns The project details
 * @throws {AzureDevOpsResourceNotFoundError} If the project is not found
 */
export async function getProject(connection: WebApi, projectId: string): Promise<TeamProject> {
  try {
    const coreApi = await connection.getCoreApi();
    const project = await coreApi.getProject(projectId);
    
    if (!project) {
      throw new AzureDevOpsResourceNotFoundError(`Project '${projectId}' not found`);
    }
    
    return project;
  } catch (error) {
    if (error instanceof AzureDevOpsResourceNotFoundError) {
      throw error;
    }
    throw new Error(`Failed to get project: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * List all projects in the organization
 * 
 * @param connection The Azure DevOps WebApi connection
 * @param options Optional parameters for listing projects
 * @returns Array of projects
 */
export async function listProjects(
  connection: WebApi,
  options: z.infer<typeof ListProjectsSchema> = {}
): Promise<TeamProject[]> {
  try {
    const coreApi = await connection.getCoreApi();
    const projects = await coreApi.getProjects(
      options.stateFilter,
      options.top,
      options.skip,
      options.continuationToken
    );
    
    return projects;
  } catch (error) {
    throw new Error(`Failed to list projects: ${error instanceof Error ? error.message : String(error)}`);
  }
} 