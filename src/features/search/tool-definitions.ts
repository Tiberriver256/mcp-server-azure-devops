import { zodToJsonSchema } from 'zod-to-json-schema';
import { ToolDefinition } from '../../shared/types/tool-definition';
import {
  SearchCodeSchema,
  SearchWikiSchema,
  SearchWorkItemsSchema,
} from './schemas';

/**
 * List of search tools
 */
export const searchTools: ToolDefinition[] = [
  {
    name: 'search_code',
    description: 'Search for code across repositories in a project',
    inputSchema: zodToJsonSchema(SearchCodeSchema),
  },
  {
    name: 'search_wiki',
    description: 'Search for content across wiki pages in a project',
    inputSchema: zodToJsonSchema(SearchWikiSchema),
  },
  {
    name: 'search_work_items',
    description: 'Search for work items across projects in Azure DevOps',
    inputSchema: zodToJsonSchema(SearchWorkItemsSchema),
  },
];
