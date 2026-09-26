import { z } from "zod";

export const RoleSchema = z.enum(["hcp", "data_steward"]);
export type Role = z.infer<typeof RoleSchema>;

export const DemoUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: RoleSchema,
  hcpId: z.string().optional(),
});
export type DemoUser = z.infer<typeof DemoUserSchema>;
