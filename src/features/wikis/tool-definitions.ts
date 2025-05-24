import { zodToJsonSchema } from 'zod-to-json-schema';
import { ToolDefinition } from '../../shared/types/tool-definition';
import { GetWikisSchema } from './get-wikis/schema';
import { GetWikiPageSchema } from './get-wiki-page/schema';
import { CreateWikiSchema } from './create-wiki/schema';
import { UpdateWikiPageSchema } from './update-wiki-page/schema';
import { CreateWikiPageSchema } from './create-wiki-page/schema';

/**
 * List of wikis tools
 */
export const wikisTools: ToolDefinition[] = [
  {
    name: 'get_wikis',
    description: 'Get details of wikis in a project',
    inputSchema: zodToJsonSchema(GetWikisSchema),
  },
  {
    name: 'get_wiki_page',
    description: 'Get the content of a wiki page',
    inputSchema: zodToJsonSchema(GetWikiPageSchema),
  },
  {
    name: 'create_wiki',
    description: 'Create a new wiki in the project',
    inputSchema: zodToJsonSchema(CreateWikiSchema),
  },
  {
    name: 'update_wiki_page',
    description: 'Update content of a wiki page',
    inputSchema: zodToJsonSchema(UpdateWikiPageSchema),
  },
  {
    name: 'create_wiki_page',
    description: 'Create a new page in a wiki. If the page already exists at the specified path, it will be updated.',
    inputSchema: zodToJsonSchema(CreateWikiPageSchema),
  },
];
