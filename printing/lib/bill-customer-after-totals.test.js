const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const {renderBillToHtml} = require('./preview.js');

describe('bill customer after totals', () => {
  it('places customer/phone/address after Total in HTML preview', () => {
    const html = renderBillToHtml(
      {
        orderId: '42',
        date: '2026-11-03',
        table: 'T1',
        userName: 'Cashier',
        items: [{name: 'Burger', qty: 1, total: 10}],
        itemsCount: 1,
        itemsTotal: 10,
        total: 10,
      },
      {currencySymbol: '$', labels: {total: 'Total', customer: 'Customer', phone: 'Phone', address: 'Address'}},
      {
        customerName: 'Ada Lovelace',
        phone: '555-0100',
        address: '123 Main St',
      },
    );

    const totalIdx = html.indexOf('>Total<');
    const customerIdx = html.indexOf('Customer: Ada Lovelace');
    const phoneIdx = html.indexOf('Phone: 555-0100');
    const addressIdx = html.indexOf('Address: 123 Main St');

    assert.ok(totalIdx > 0, 'Total should be present');
    assert.ok(customerIdx > totalIdx, 'Customer should appear after Total');
    assert.ok(phoneIdx > customerIdx, 'Phone should follow Customer');
    assert.ok(addressIdx > phoneIdx, 'Address should follow Phone');

    const headerSlice = html.slice(0, totalIdx);
    assert.equal(headerSlice.includes('Customer: Ada Lovelace'), false);
  });
});
