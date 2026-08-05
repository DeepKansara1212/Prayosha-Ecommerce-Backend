import { z } from "zod";

export const searchLocationQuerySchema = z.object({
  place: z.string().trim().min(2, "Please enter at least 2 characters"),
});
