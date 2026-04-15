import { z } from "zod";

export const viewportSchema = z.object({
  name: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive()
});

export const styleSystemSchema = z.object({
  type: z.enum(["tailwind", "css", "unknown"]),
  entryPoints: z.array(z.string()).default([])
});

export const sourceMapSchema = z.object({
  componentRoots: z.array(z.string()).default([])
});

export const betterBrowseConfigSchema = z.object({
  engine: z.literal("playwright"),
  framework: z.enum(["next", "react", "unknown"]),
  baseUrl: z.string().url(),
  viewports: z.array(viewportSchema).min(1),
  routes: z.array(z.string()).min(1),
  routesFile: z.string().optional(),
  writeMode: z.enum(["diff-only", "apply"]),
  styleSystem: styleSystemSchema,
  sourceMap: sourceMapSchema
});
