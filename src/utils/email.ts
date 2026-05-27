import nodemailer from "nodemailer";
import { IOrder } from "../models/order.model";
import { IUser } from "../models/user.model";
import { env } from "../config/env";

export async function sendOrderConfirmationEmail(
  order: IOrder,
  user: IUser
): Promise<void> {
  if (!env.EMAIL_USER || !env.EMAIL_PASS) {
    console.log("Email skipped: no credentials");
    return;
  }

  if (!user.email) return;

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: env.EMAIL_USER, pass: env.EMAIL_PASS },
    });

    const itemRows = order.items
      .map(
        (item) => `
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #E2DAC8;color:#1C1A17;">${item.name}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #E2DAC8;text-align:center;color:#1C1A17;">${item.quantity}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #E2DAC8;text-align:right;color:#1C1A17;">₹${item.price.toLocaleString("en-IN")}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #E2DAC8;text-align:right;color:#1C1A17;font-weight:600;">₹${(item.price * item.quantity).toLocaleString("en-IN")}</td>
        </tr>`
      )
      .join("");

    const discountRow =
      order.discount > 0
        ? `<tr>
            <td colspan="3" style="padding:8px 14px;text-align:right;color:#6B6057;">
              Discount${order.couponCode ? ` (${order.couponCode})` : ""}
            </td>
            <td style="padding:8px 14px;text-align:right;color:#16A34A;font-weight:600;">
              − ₹${order.discount.toLocaleString("en-IN")}
            </td>
          </tr>`
        : "";

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Order Confirmed</title>
</head>
<body style="margin:0;padding:0;background:#EDE8DC;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#EDE8DC;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#F5F0E8;border:1px solid #E2DAC8;border-radius:8px;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:#1C1A17;padding:28px 40px;text-align:center;">
              <p style="margin:0;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#C4A35A;">
                Prayosha Crystal
              </p>
              <p style="margin:8px 0 0;font-size:22px;font-weight:600;letter-spacing:0.04em;color:#F5F0E8;">
                Order Confirmed
              </p>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding:32px 40px 0;">
              <p style="margin:0;font-size:15px;color:#1C1A17;line-height:1.6;">
                Dear <strong>${user.name}</strong>,
              </p>
              <p style="margin:10px 0 0;font-size:14px;color:#6B6057;line-height:1.6;">
                Thank you for your order. We have received it and will begin processing it shortly.
                Your order number is <strong style="color:#1C1A17;">#${order.orderNumber}</strong>.
              </p>
            </td>
          </tr>

          <!-- Items table -->
          <tr>
            <td style="padding:28px 40px 0;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E2DAC8;border-radius:6px;overflow:hidden;">
                <thead>
                  <tr style="background:#EDE8DC;">
                    <th style="padding:10px 14px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#6B6057;font-weight:600;">Item</th>
                    <th style="padding:10px 14px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#6B6057;font-weight:600;">Qty</th>
                    <th style="padding:10px 14px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#6B6057;font-weight:600;">Price</th>
                    <th style="padding:10px 14px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#6B6057;font-weight:600;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemRows}
                </tbody>
                <tfoot>
                  <tr>
                    <td colspan="3" style="padding:8px 14px;text-align:right;font-size:13px;color:#6B6057;">Subtotal</td>
                    <td style="padding:8px 14px;text-align:right;font-size:13px;color:#1C1A17;">₹${order.subtotal.toLocaleString("en-IN")}</td>
                  </tr>
                  ${discountRow}
                  <tr>
                    <td colspan="3" style="padding:8px 14px;text-align:right;font-size:13px;color:#6B6057;">Shipping</td>
                    <td style="padding:8px 14px;text-align:right;font-size:13px;color:#1C1A17;">
                      ${order.shippingCharge === 0 ? '<span style="color:#16A34A;">Free</span>' : `₹${order.shippingCharge.toLocaleString("en-IN")}`}
                    </td>
                  </tr>
                  <tr style="background:#EDE8DC;">
                    <td colspan="3" style="padding:12px 14px;text-align:right;font-size:15px;font-weight:700;color:#1C1A17;">Total</td>
                    <td style="padding:12px 14px;text-align:right;font-size:15px;font-weight:700;color:#1C1A17;">₹${order.total.toLocaleString("en-IN")}</td>
                  </tr>
                </tfoot>
              </table>
            </td>
          </tr>

          <!-- Order details -->
          <tr>
            <td style="padding:24px 40px 0;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#EDE8DC;border:1px solid #E2DAC8;border-radius:6px;padding:16px;">
                <tr>
                  <td style="padding:6px 16px;font-size:12px;color:#6B6057;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;width:140px;">Payment</td>
                  <td style="padding:6px 16px;font-size:13px;color:#1C1A17;">
                    ${order.paymentMethod === "cod" ? "Cash on Delivery" : "Online · Razorpay"}
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 16px;font-size:12px;color:#6B6057;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">Ship to</td>
                  <td style="padding:6px 16px;font-size:13px;color:#1C1A17;">
                    ${order.shippingAddress.fullName}, ${order.shippingAddress.line1}${order.shippingAddress.line2 ? ", " + order.shippingAddress.line2 : ""},
                    ${order.shippingAddress.city}, ${order.shippingAddress.state} — ${order.shippingAddress.pincode}
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 16px;font-size:12px;color:#6B6057;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">Delivery</td>
                  <td style="padding:6px 16px;font-size:13px;color:#1C1A17;">Estimated 5–7 business days</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:32px 40px;text-align:center;border-top:1px solid #E2DAC8;margin-top:28px;">
              <p style="margin:0 0 6px;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#C4A35A;">
                Prayosha Crystal
              </p>
              <p style="margin:0;font-size:12px;color:#9E9590;line-height:1.6;">
                Questions? Reply to this email and we'll be happy to help.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    await transporter.sendMail({
      from: `"Prayosha Crystal" <${env.EMAIL_USER}>`,
      to: user.email,
      subject: `Order Confirmed — #${order.orderNumber} | Prayosha Crystal`,
      html,
    });
  } catch (err) {
    console.error("Order confirmation email failed:", err);
  }
}
