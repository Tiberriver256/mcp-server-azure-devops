import { toJsonSchema } from '../../shared/utils/to-json-schema';
import type { ToolDefinition } from '../../shared/types/tool-definition';
import {
  ListProjectsSchema,
  GetProjectSchema,
  GetProjectDetailsSchema,
} from './schemas';

/**
 * List of projects tools
 */
export const projectsTools: ToolDefinition[] = [
  {
    name: 'list_projects',
    description: 'List all projects in an organization',
    inputSchema: toJsonSchema(ListProjectsSchema),
    readOnly: true,
  },
  {
    name: 'get_project',
    description: 'Get details of a specific project',
    inputSchema: toJsonSchema(GetProjectSchema),
    readOnly: true,
  },
  {
    name: 'get_project_details',
    description:
      'Get comprehensive details of a project including process, work item types, and teams',
    inputSchema: toJsonSchema(GetProjectDetailsSchema),
    readOnly: true,
  },
];
