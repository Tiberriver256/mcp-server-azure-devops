import { z } from 'zod';

/**
 * Schema for the get_me tool, which takes no parameters
 */
export const GetMeSchema = z.object({}).strict();
