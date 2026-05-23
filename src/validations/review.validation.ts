import { z } from "zod";

export const submitReviewSchema = z.object({
  rating: z
    .number({ required_error: "Rating is required" })
    .int()
    .min(1, "Rating must be at least 1")
    .max(5, "Rating must be at most 5"),
  title: z.string().min(1, "Title is required").max(100),
  body: z.string().min(1, "Body is required").max(1000),
});
