import { z } from "zod";

export const settingsUpdateSchema = z.object({
  freeGiftEnabled: z.boolean().optional(),
  whatsappNumber: z.string().max(15).optional(),
  whatsappDefaultMessage: z.string().max(300).optional(),
});

export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;
