import { env } from "../config/env";
import { ApiError } from "./ApiError";

export const sendSms = async (to: string, message: string): Promise<void> => {
  if (env.NODE_ENV !== "production") {
    // OTP is printed to console in dev — copy it from the server terminal
    console.log(`\n[SMS DEV] To: ${to}\n[SMS DEV] ${message}\n`);
    return;
  }

  // ── Production: wire in your SMS provider below ──────────────────────────
  //
  // Twilio:
  //   import twilio from "twilio";
  //   const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  //   await client.messages.create({ to, from: env.TWILIO_PHONE_NUMBER, body: message });
  //
  // MSG91 (popular in India):
  //   await fetch(`https://api.msg91.com/api/v5/flow/`, { method: "POST", ... });
  //
  // Fast2SMS:
  //   await fetch(`https://www.fast2sms.com/dev/bulkV2?...`);
  //
  throw new ApiError(500, "SMS provider not configured for production");
};
