import { z } from 'zod';

import {
  nullableProjectIdField,
  nullableOrganizationIdField,
} from '../../../shared/schemas';

/**
 * Schema for listing wikis in an Azure DevOps project or organization
 */
export const GetWikisSchema = z.object({
  organizationId: nullableOrganizationIdField,
  projectId: nullableProjectIdField,
});
