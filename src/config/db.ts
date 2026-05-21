import mongoose from "mongoose";
import { env } from "./env";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 3000;

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const connectDB = async (): Promise<void> => {
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    try {
      attempt++;
      console.log(`MongoDB connection attempt ${attempt}/${MAX_RETRIES}...`);

      await mongoose.connect(env.MONGODB_URI);

      console.log(`MongoDB connected: ${mongoose.connection.host}`);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`MongoDB connection attempt ${attempt} failed: ${message}`);

      if (attempt < MAX_RETRIES) {
        console.log(`Retrying in ${RETRY_DELAY_MS / 1000}s...`);
        await sleep(RETRY_DELAY_MS);
      } else {
        console.error("All MongoDB connection attempts failed. Exiting.");
        process.exit(1);
      }
    }
  }
};
