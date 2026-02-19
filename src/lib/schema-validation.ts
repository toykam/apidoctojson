import { z } from 'zod';

export const MOJOutputSchema = z.object({
  endpoints: z.array(
    z.object({
      id: z.string().describe('Unique semantic slug for the endpoint'),
      context: z.string().describe('Brief summary of what the endpoint does'),
      blueprint: z.object({
        method: z.string(),
        path: z.string(),
        headers: z.array(z.string()).optional(),
        parameters: z.record(z.string(), z.any()).optional(),
        body: z.any().optional(),
      }),
      success_schema: z.any().describe('Example of a successful JSON response'),
    })
  ),
});

export type MOJOutput = z.infer<typeof MOJOutputSchema>;
