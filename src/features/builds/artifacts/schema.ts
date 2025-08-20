import { z } from 'zod';

/**
 * Schema for listing build artifacts
 */
export const ListBuildArtifactsSchema = z.object({
  projectId: z.string().optional().describe('Project ID or name'),
  buildId: z.number().describe('Build ID'),
});

/**
 * Schema for getting build artifact details
 */
export const GetBuildArtifactSchema = z.object({
  projectId: z.string().optional().describe('Project ID or name'),
  buildId: z.number().describe('Build ID'),
  artifactName: z.string().describe('Artifact name'),
});

export type ListBuildArtifactsInput = z.infer<typeof ListBuildArtifactsSchema>;
export type GetBuildArtifactInput = z.infer<typeof GetBuildArtifactSchema>;
