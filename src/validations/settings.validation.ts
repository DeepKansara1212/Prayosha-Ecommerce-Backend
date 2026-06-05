import { z } from "zod";

export const settingsUpdateSchema = z.object({
  freeGiftEnabled: z.boolean().optional(),
});

export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;
