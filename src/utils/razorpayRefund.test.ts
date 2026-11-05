import { describe, expect, it } from "vitest";
import { ApiError } from "./ApiError";
import {
  getCancellationRefundReceipt,
  getFullRefundAmountInPaise,
  getRefundFailureDetails,
  isCancellationRefundReceipt,
} from "./razorpayRefund";

describe("Razorpay refund helpers", () => {
  it("converts INR order totals to safe integer paise", () => {
    expect(getFullRefundAmountInPaise(49)).toBe(4900);
    expect(getFullRefundAmountInPaise(49.99)).toBe(4999);
    expect(() => getFullRefundAmountInPaise(0)).toThrow(ApiError);
  });

  it("produces a stable internal receipt for a cancellation refund", () => {
    expect(getCancellationRefundReceipt("order-id")).toBe("cancel_order-id");
    expect(getCancellationRefundReceipt("order-id", 2)).toBe("cancel_order-id_2");
    expect(isCancellationRefundReceipt("order-id", "cancel_order-id_2")).toBe(true);
    expect(isCancellationRefundReceipt("order-id", "cancel_another-order_2")).toBe(false);
  });

  it("extracts safe Razorpay error details and marks client rejections definite", () => {
    expect(getRefundFailureDetails({
      statusCode: 400,
      error: {
        code: "BAD_REQUEST_ERROR",
        description: "Payment is not captured",
        field: "payment_id",
      },
    })).toEqual({
      reason: "Payment is not captured",
      statusCode: 400,
      code: "BAD_REQUEST_ERROR",
      definite: true,
    });
  });

  it("does not mark network or server errors as definite failures", () => {
    expect(getRefundFailureDetails(new Error("socket timed out"))).toMatchObject({
      reason: "socket timed out",
      definite: false,
    });
    expect(getRefundFailureDetails({
      statusCode: 503,
      error: { code: "SERVER_ERROR", description: "Temporary issue" },
    })).toMatchObject({
      statusCode: 503,
      definite: false,
    });
  });

  it("does not expose multiline or excessively long provider messages", () => {
    expect(getRefundFailureDetails({
      statusCode: 400,
      error: { description: `First line\n${"x".repeat(500)}` },
    }).reason).toHaveLength(400);
  });
});
