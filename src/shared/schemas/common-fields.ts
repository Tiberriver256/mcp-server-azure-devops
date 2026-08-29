import { z } from 'zod';
import { defaultProject, defaultOrg } from '../../utils/environment';

export const projectIdField = z
  .string()
  .optional()
  .describe(`The ID or name of the project (Default: ${defaultProject})`);

export const organizationIdField = z
  .string()
  .optional()
  .describe(`The ID or name of the organization (Default: ${defaultOrg})`);

export const nullableProjectIdField = z
  .string()
  .optional()
  .nullable()
  .describe(`The ID or name of the project (Default: ${defaultProject})`);

export const nullableOrganizationIdField = z
  .string()
  .optional()
  .nullable()
  .describe(`The ID or name of the organization (Default: ${defaultOrg})`);

export const withProjectAndOrg = {
  projectId: projectIdField,
  organizationId: organizationIdField,
};

export const withNullableProjectAndOrg = {
  projectId: nullableProjectIdField,
  organizationId: nullableOrganizationIdField,
};
