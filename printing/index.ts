/**
 * Print server runs separately: `cd printing && npm start`
 * POST http://localhost:3132/print
 *
 * Body: {
 *   printers: Array<{ type, ...driverConfig }>,
 *   data: {
 *     printType: 'temp'|'summary'|'kitchen'|'delivery'|'final',
 *     // temp, final, delivery, kitchen: order (Order from @/api/model/order)
 *     order?: Order,
 *     // summary only: title?, date?, orders?, subtotal?, tax?, total?, payments?
 *   },
 *   config?: { bottomMargin?, topMargin?, leftMargin?, rightMargin?, companyName?, logo?, showCompanyName?, showItemName?, showItemPrice?, showItemQuantity?, showItemTotal?, showVatNumber?, vatName?, vatNumber? }
 * }
 */

export const PRINT_SERVER_URL = 'http://localhost:3132';
