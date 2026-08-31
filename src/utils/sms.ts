import axios from "axios";
import { env } from "../config/env";
import { ApiError } from "./ApiError";

export const sendOtpSms = async (
  to: string,
  otp: string
): Promise<void> => {
  const hasMsg91Config = Boolean(env.MSG91_AUTH_KEY && env.MSG91_TEMPLATE_ID);

  if (env.NODE_ENV !== "production" && !hasMsg91Config) {
    // OTP is printed to console in dev — copy it from the server terminal
    console.log(`\n[SMS DEV] To: ${to}\n[SMS DEV] OTP: ${otp}\n`);
    return;
  }

  if (!hasMsg91Config || !env.MSG91_AUTH_KEY || !env.MSG91_TEMPLATE_ID) {
    throw new ApiError(500, "MSG91 SMS provider is not configured");
  }

  const mobile = to.startsWith("+") ? to.slice(1) : to;

  try {
    const response = await axios.post<{ type?: string }>(
      "https://control.msg91.com/api/v5/flow",
      {
        template_id: env.MSG91_TEMPLATE_ID,
        short_url: "0",
        recipients: [{ mobiles: mobile, VAR1: otp }],
      },
      {
        headers: {
          authkey: env.MSG91_AUTH_KEY,
          accept: "application/json",
          "content-type": "application/json",
        },
        timeout: 10_000,
      }
    );

    if (response.data.type && response.data.type !== "success") {
      throw new Error(`MSG91 rejected the OTP request: ${response.data.type}`);
    }
  } catch (error) {
    console.error("MSG91 OTP delivery failed", error);
    throw new ApiError(502, "Unable to send OTP right now. Please try again.");
  }
};
