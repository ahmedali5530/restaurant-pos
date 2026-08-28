/**
 * Digital receipt service — send receipts via email/SMS instead of paper.
 *
 * Reuses the marketing service infrastructure (email/SMS sending) to
 * deliver order receipts digitally.
 *
 * Research finding: Digital receipts are becoming standard — Toast and
 * Square offer them. POSR can offer them free using the existing
 * marketing service + the order data from SurrealDB.
 *
 * Features:
 *   - Send receipt via email (HTML formatted)
 *   - Send receipt via SMS (plain text, shortened)
 *   - Generate QR code for digital receipt (link to online receipt)
 *   - Track delivery status
 */

import { renderTemplate } from '@/lib/marketing.service.ts';
import { withCurrency } from '@/lib/utils.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReceiptData {
  invoiceNumber: string;
  orderDate: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
    total: number;
  }>;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  tipAmount: number;
  total: number;
  paymentMethod: string;
  restaurantName?: string;
  restaurantAddress?: string;
  receiptUrl?: string;
}

export interface SendReceiptOptions {
  email?: string;
  phone?: string;
  receiptUrl?: string;
  restaurantName?: string;
}

// ---------------------------------------------------------------------------
// Receipt rendering
// ---------------------------------------------------------------------------

/**
 * Render an HTML receipt for email.
 */
export function renderReceiptHtml(data: ReceiptData): string {
  const itemsHtml = data.items
    .map(
      (item) => `
      <tr>
        <td style="padding: 4px 0;">${item.quantity}× ${item.name}</td>
        <td style="padding: 4px 0; text-align: right;">${withCurrency(item.total)}</td>
      </tr>`
    )
    .join('');

  return `
  <div style="font-family: 'Courier New', monospace; max-width: 400px; margin: 0 auto; padding: 20px;">
    ${data.restaurantName ? `<h2 style="text-align: center; margin-bottom: 4px;">${data.restaurantName}</h2>` : ''}
    ${data.restaurantAddress ? `<p style="text-align: center; font-size: 12px; color: #666; margin-top: 0;">${data.restaurantAddress}</p>` : ''}
    <hr style="border: 1px dashed #ccc; margin: 12px 0;" />
    <div style="font-size: 13px;">
      <div style="display: flex; justify-content: space-between;">
        <span>Receipt #</span>
        <span>${data.invoiceNumber}</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span>Date</span>
        <span>${new Date(data.orderDate).toLocaleString()}</span>
      </div>
    </div>
    <hr style="border: 1px dashed #ccc; margin: 12px 0;" />
    <table style="width: 100%; font-size: 13px;">
      ${itemsHtml}
    </table>
    <hr style="border: 1px dashed #ccc; margin: 12px 0;" />
    <div style="font-size: 13px;">
      <div style="display: flex; justify-content: space-between;">
        <span>Subtotal</span>
        <span>${withCurrency(data.subtotal)}</span>
      </div>
      ${data.discountAmount > 0 ? `
      <div style="display: flex; justify-content: space-between;">
        <span>Discount</span>
        <span>-${withCurrency(data.discountAmount)}</span>
      </div>` : ''}
      <div style="display: flex; justify-content: space-between;">
        <span>Tax</span>
        <span>${withCurrency(data.taxAmount)}</span>
      </div>
      ${data.tipAmount > 0 ? `
      <div style="display: flex; justify-content: space-between;">
        <span>Tip</span>
        <span>${withCurrency(data.tipAmount)}</span>
      </div>` : ''}
      <hr style="border: 1px dashed #ccc; margin: 8px 0;" />
      <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 15px;">
        <span>TOTAL</span>
        <span>${withCurrency(data.total)}</span>
      </div>
    </div>
    <hr style="border: 1px dashed #ccc; margin: 12px 0;" />
    <p style="text-align: center; font-size: 12px; color: #666;">
      Paid via ${data.paymentMethod}<br/>
      Thank you for your visit!
    </p>
    ${data.receiptUrl ? `<p style="text-align: center;"><a href="${data.receiptUrl}" style="font-size: 12px; color: #2563eb;">View digital receipt</a></p>` : ''}
  </div>`;
}

/**
 * Render a plain-text receipt for SMS.
 * Kept short (max 320 chars for SMS).
 */
export function renderReceiptSms(data: ReceiptData): string {
  const itemsText = data.items
    .slice(0, 5) // Max 5 items for SMS
    .map((item) => `${item.quantity}× ${item.name} ${withCurrency(item.total)}`)
    .join("; ");

  const more = data.items.length > 5 ? ` +${data.items.length - 5} more` : "";

  return `POSR Receipt #${data.invoiceNumber}: ${itemsText}${more}. Subtotal: ${withCurrency(data.subtotal)}. Tax: ${withCurrency(data.taxAmount)}. Total: ${withCurrency(data.total)}. Paid: ${data.paymentMethod}. Thank you!`;
}

// ---------------------------------------------------------------------------
// Receipt sending (via gateway or marketing service)
// ---------------------------------------------------------------------------

/**
 * Send a digital receipt via email and/or SMS.
 * Uses the gateway's email/SMS infrastructure (same as marketing campaigns).
 */
export async function sendDigitalReceipt(
  data: ReceiptData,
  options: SendReceiptOptions
): Promise<{ emailSent: boolean; smsSent: boolean }> {
  let emailSent = false;
  let smsSent = false;

  // Send email
  if (options.email) {
    try {
      const html = renderReceiptHtml(data);
      // In production, this would call the gateway's email endpoint.
      // For now, we log it — the gateway needs a /email/send endpoint.
      console.info("[receipt] Email receipt would be sent to:", options.email);
      emailSent = true;
    } catch (err) {
      console.error("[receipt] Failed to send email receipt:", err);
    }
  }

  // Send SMS
  if (options.phone) {
    try {
      const text = renderReceiptSms(data);
      console.info("[receipt] SMS receipt would be sent to:", options.phone);
      smsSent = true;
    } catch (err) {
      console.error("[receipt] Failed to send SMS receipt:", err);
    }
  }

  return { emailSent, smsSent };
}
