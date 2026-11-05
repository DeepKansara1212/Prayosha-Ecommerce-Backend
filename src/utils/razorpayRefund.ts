import { ApiError } from "./ApiError";

export interface RefundFailureDetails {
  reason: string;
  statusCode?: number;
  code?: string;
  definite: boolean;
}

interface RazorpayErrorShape {
  statusCode?: number | string;
  message?: string;
  error?: {
    code?: string;
    description?: string;
    field?: string;
    source?: string;
    step?: string;
    reason?: string;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getRefundFailureDetails(error: unknown): RefundFailureDetails {
  const shape = (isRecord(error) ? error : {}) as RazorpayErrorShape;
  const statusCode = Number(shape.statusCode);
  const normalizedStatusCode = Number.isFinite(statusCode) ? statusCode : undefined;
  const code =
    typeof shape.error?.code === "string" ? shape.error.code : undefined;
  const reason = [
    shape.error?.description,
    shape.error?.reason,
    shape.message,
    error instanceof Error ? error.message : undefined,
  ].find((candidate): candidate is string =>
    typeof candidate === "string" && candidate.trim().length > 0,
  );
  const detail = (reason || "Razorpay refund request failed")
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 400);

  return {
    reason: detail,
    ...(normalizedStatusCode !== undefined
      ? { statusCode: normalizedStatusCode }
      : {}),
    ...(code ? { code } : {}),
    definite:
      error instanceof ApiError ||
      (normalizedStatusCode !== undefined &&
        normalizedStatusCode >= 400 &&
        normalizedStatusCode < 500),
  };
}

export function getFullRefundAmountInPaise(orderTotal: number): number {
  if (!Number.isFinite(orderTotal) || orderTotal <= 0) {
    throw new ApiError(400, "Order total must be greater than zero to refund");
  }
  const amount = Math.round(orderTotal * 100);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new ApiError(400, "Order total is invalid for a Razorpay refund");
  }
  return amount;
}

export function getCancellationRefundReceipt(
  orderId: string,
  attempt?: number,
): string {
  return attempt ? `cancel_${orderId}_${attempt}` : `cancel_${orderId}`;
}

export function isCancellationRefundReceipt(
  orderId: string,
  receipt: string | null | undefined,
): boolean {
  return Boolean(
    receipt &&
      (receipt === getCancellationRefundReceipt(orderId) ||
        receipt.startsWith(`${getCancellationRefundReceipt(orderId)}_`)),
  );
}
