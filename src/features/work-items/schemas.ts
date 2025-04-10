import { z } from 'zod';
import { WorkItemExpand } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import { defaultProject, defaultOrg } from '../../utils/environment';

/**
 * Schema for getting a work item
 */
export const GetWorkItemSchema = z.object({
  workItemId: z.number().describe('The ID of the work item'),
  expand: z
    .nativeEnum(WorkItemExpand)
    .optional()
    .describe(
      'The level of detail to include in the response. Defaults to "all" if not specified.',
    ),
});

/**
 * Schema for listing work items
 */
export const ListWorkItemsSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe(`The ID or name of the project (Default: ${defaultProject})`),
  organizationId: z
    .string()
    .optional()
    .describe(`The ID or name of the organization (Default: ${defaultOrg})`),
  teamId: z.string().optional().describe('The ID of the team'),
  queryId: z.string().optional().describe('ID of a saved work item query'),
  wiql: z.string().optional().describe('Work Item Query Language (WIQL) query'),
  top: z.number().optional().describe('Maximum number of work items to return'),
  skip: z.number().optional().describe('Number of work items to skip'),
});

/**
 * Schema for creating a work item
 */
export const CreateWorkItemSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe(`The ID or name of the project (Default: ${defaultProject})`),
  organizationId: z
    .string()
    .optional()
    .describe(`The ID or name of the organization (Default: ${defaultOrg})`),
  workItemType: z
    .string()
    .describe(
      'The type of work item to create (e.g., "Task", "Bug", "User Story")',
    ),
  title: z.string().describe('The title of the work item'),
  description: z
    .string()
    .optional()
    .describe('The description of the work item'),
  assignedTo: z
    .string()
    .optional()
    .describe('The email or name of the user to assign the work item to'),
  areaPath: z.string().optional().describe('The area path for the work item'),
  iterationPath: z
    .string()
    .optional()
    .describe('The iteration path for the work item'),
  priority: z.number().optional().describe('The priority of the work item'),
  parentId: z
    .number()
    .optional()
    .describe('The ID of the parent work item to create a relationship with'),
  additionalFields: z
    .record(z.string(), z.any())
    .optional()
    .describe('Additional fields to set on the work item'),
});

/**
 * Schema for updating a work item
 */
export const UpdateWorkItemSchema = z.object({
  workItemId: z.number().describe('The ID of the work item to update'),
  title: z.string().optional().describe('The updated title of the work item'),
  description: z
    .string()
    .optional()
    .describe('The updated description of the work item'),
  assignedTo: z
    .string()
    .optional()
    .describe('The email or name of the user to assign the work item to'),
  areaPath: z
    .string()
    .optional()
    .describe('The updated area path for the work item'),
  iterationPath: z
    .string()
    .optional()
    .describe('The updated iteration path for the work item'),
  priority: z
    .number()
    .optional()
    .describe('The updated priority of the work item'),
  state: z.string().optional().describe('The updated state of the work item'),
  additionalFields: z
    .record(z.string(), z.any())
    .optional()
    .describe('Additional fields to update on the work item'),
});

/**
 * Schema for managing work item links
 */
export const ManageWorkItemLinkSchema = z.object({
  sourceWorkItemId: z.number().describe('The ID of the source work item'),
  targetWorkItemId: z.number().describe('The ID of the target work item'),
  projectId: z
    .string()
    .optional()
    .describe(`The ID or name of the project (Default: ${defaultProject})`),
  organizationId: z
    .string()
    .optional()
    .describe(`The ID or name of the organization (Default: ${defaultOrg})`),
  operation: z
    .enum(['add', 'remove', 'update'])
    .describe('The operation to perform on the link'),
  relationType: z
    .string()
    .describe(
      'The reference name of the relation type (e.g., "System.LinkTypes.Hierarchy-Forward")',
    ),
  newRelationType: z
    .string()
    .optional()
    .describe('The new relation type to use when updating a link'),
  comment: z
    .string()
    .optional()
    .describe('Optional comment explaining the link'),
});
