import { z } from "zod";

export const skillFrontmatterSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "name is required")
      .regex(/^[A-Za-z0-9._-]+$/, "name must not contain path separators or whitespace"),
    description: z.string().trim().min(1, "description is required"),
    version: z.string().optional(),
    "allowed-tools": z.union([z.array(z.string()), z.string()]).optional(),
    "user-invocable": z.boolean().optional(),
    tools: z.union([z.array(z.string()), z.string()]).optional(),
    "argument-hint": z.string().optional(),
    license: z.string().optional(),
  })
  .passthrough();

export type SkillFrontmatter = z.infer<typeof skillFrontmatterSchema>;
