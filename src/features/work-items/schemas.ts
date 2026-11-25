import { z } from 'zod';

const projectIdDescription =
  'The ID or name of the project (defaults to AZURE_DEVOPS_DEFAULT_PROJECT)';
const organizationIdDescription =
  'The ID or name of the organization (defaults to configured organization)';

/**
 * Schema for getting a work item
 */
export const GetWorkItemSchema = z.object({
  workItemId: z.number().describe('The ID of the work item'),
  expand: z
    .enum(['none', 'relations', 'fields', 'links', 'all'])
    .optional()
    .describe(
      'The level of detail to include in the response. Defaults to "all" if not specified.',
    ),
});

/**
 * Schema for listing work items
 */
export const ListWorkItemsSchema = z.object({
  projectId: z.string().optional().describe(projectIdDescription),
  organizationId: z.string().optional().describe(organizationIdDescription),
  teamId: z.string().optional().describe('The ID of the team'),
  queryId: z.string().optional().describe('ID of a saved work item query'),
  wiql: z.string().optional().describe('Work Item Query Language (WIQL) query'),
  top: z.number().optional().describe('Maximum number of work items to return'),
  skip: z.number().optional().describe('Number of work items to skip'),
  fields: z
    .array(z.string())
    .optional()
    .describe(
      'List of additional fields to include in the response beyond the defaults ' +
        '(System.Id, System.Title, System.State, System.AssignedTo). ' +
        'Use full field reference names, e.g. "Microsoft.VSTS.Scheduling.StoryPoints", ' +
        '"System.IterationPath", "System.AreaPath".',
    ),
});

/**
 * Schema for creating a work item
 */
export const CreateWorkItemSchema = z.object({
  projectId: z.string().optional().describe(projectIdDescription),
  organizationId: z.string().optional().describe(organizationIdDescription),
  workItemType: z
    .string()
    .describe(
      'The type of work item to create (e.g., "Task", "Bug", "User Story")',
    ),
  title: z.string().describe('The title of the work item'),
  description: z
    .string()
    .optional()
    .describe(
      'Work item description. Defaults to HTML format; set descriptionFormat to "markdown" to store and render as Markdown. Other multi-line text fields (i.e., System.History, AcceptanceCriteria, etc.) use HTML format by default. Do not use CDATA tags.',
    ),
  descriptionFormat: z
    .enum(['html', 'markdown'])
    .optional()
    .describe(
      'Format for the description field: "html" (default) or "markdown". Setting "markdown" instructs Azure DevOps to store and render System.Description as Markdown (cannot be reverted back to HTML once saved).',
    ),
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
  tags: z.array(z.string()).optional().describe('Tags to add to the work item'),
  additionalFields: z
    .record(z.string(), z.any())
    .optional()
    .describe(
      'Additional Azure DevOps fields to set by reference name (fields not exposed as named parameters). Example for Bug severity: { "Microsoft.VSTS.Common.Severity": "1 - Critical" } (accepted values: "1 - Critical", "2 - High", "3 - Medium", "4 - Low"). Multi-line text fields (i.e., System.History, AcceptanceCriteria, etc.) must use HTML format. Do not use CDATA tags.',
    ),
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
    .describe(
      'Updated work item description. When descriptionFormat is omitted or "html", the field preserves its existing format (HTML or Markdown); set descriptionFormat to "markdown" to store or switch System.Description to Markdown. Other multi-line text fields (i.e., System.History, AcceptanceCriteria, etc.) use HTML format by default. Do not use CDATA tags.',
    ),
  descriptionFormat: z
    .enum(['html', 'markdown'])
    .optional()
    .describe(
      'Format for the description field: omit or pass "html" to preserve the field\'s existing format (cannot revert a Markdown field back to HTML), or pass "markdown" to store/switch System.Description as Markdown (irreversible once saved).',
    ),
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
  tags: z
    .array(z.string())
    .optional()
    .describe('Overwrite/set the complete set of tags'),
  tagsToAdd: z
    .array(z.string())
    .optional()
    .describe('List of tags to append to the work item'),
  tagsToRemove: z
    .array(z.string())
    .optional()
    .describe('List of tags to remove from the work item'),
  additionalFields: z
    .record(z.string(), z.any())
    .optional()
    .describe(
      'Additional Azure DevOps fields to update by reference name (fields not exposed as named parameters). Example for Bug severity: { "Microsoft.VSTS.Common.Severity": "1 - Critical" } (accepted values: "1 - Critical", "2 - High", "3 - Medium", "4 - Low"). Multi-line text fields (i.e., System.History, AcceptanceCriteria, etc.) must use HTML format. Do not use CDATA tags.',
    ),
});

/**
 * Schema for managing work item links
 */
export const ManageWorkItemLinkSchema = z.object({
  sourceWorkItemId: z.number().describe('The ID of the source work item'),
  targetWorkItemId: z.number().describe('The ID of the target work item'),
  projectId: z.string().optional().describe(projectIdDescription),
  organizationId: z.string().optional().describe(organizationIdDescription),
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

/**
 * Schema for getting work item comments
 */
export const GetWorkItemCommentsSchema = z.object({
  workItemId: z.number().describe('The ID of the work item'),
  projectId: z.string().optional().describe('The ID or name of the project'),
  top: z.number().optional().describe('Maximum number of comments to return'),
  continuationToken: z
    .string()
    .optional()
    .describe('Continuation token to retrieve the next page of comments'),
  includeDeleted: z.boolean().optional().describe('Include deleted comments'),
  expand: z
    .enum(['none', 'reactions', 'renderedText', 'all'])
    .optional()
    .default('all')
    .describe(
      'The level of detail to include in the comments response (Default: "all")',
    ),
  order: z
    .enum(['asc', 'desc'])
    .optional()
    .default('asc')
    .describe('The order in which to sort the comments (Default: "asc")'),
});

export {
  CreateWorkItemAttachmentSchema,
  GetWorkItemAttachmentSchema,
  DeleteWorkItemAttachmentSchema,
} from './attachment-schemas.ts';
