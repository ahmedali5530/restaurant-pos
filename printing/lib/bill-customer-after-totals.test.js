const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const {renderBillToHtml} = require('./preview.js');

describe('bill customer after totals', () => {
  it('places customer after settlement and before custom footer', () => {
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
        payments: [{method: 'CardVisa', amount: 10}],
        change: 2,
      },
      {
        currencySymbol: '$',
        labels: {
          total: 'Total',
          customer: 'Customer',
          phone: 'Phone',
          address: 'Address',
          payment: 'Payment',
          change: 'Change',
        },
        footerSections: [{type: 'text', content: 'CUSTOM FOOTER LINE', align: 'center', enabled: true}],
      },
      {
        customerName: 'Ada Lovelace',
        phone: '555-0100',
        address: '123 Main St',
        thankYou: 'Thank you!',
        showPayments: true,
        showChange: true,
      },
    );

    const totalIdx = html.indexOf('>Total<');
    const paymentIdx = html.indexOf('CardVisa');
    const changeIdx = html.indexOf('>Change<');
    const thankYouIdx = html.indexOf('Thank you!');
    const customerIdx = html.indexOf('Customer: Ada Lovelace');
    const phoneIdx = html.indexOf('Phone: 555-0100');
    const addressIdx = html.indexOf('Address: 123 Main St');
    const footerIdx = html.indexOf('CUSTOM FOOTER LINE');

    assert.ok(totalIdx > 0, 'Total should be present');
    assert.ok(paymentIdx > totalIdx, 'Payments should follow Total');
    assert.ok(changeIdx > paymentIdx, 'Change should follow payments');
    assert.ok(thankYouIdx > changeIdx, 'Thank you should follow change');
    assert.ok(customerIdx > thankYouIdx, 'Customer should appear after thank you');
    assert.ok(phoneIdx > customerIdx, 'Phone should follow Customer');
    assert.ok(addressIdx > phoneIdx, 'Address should follow Phone');
    assert.ok(footerIdx > addressIdx, 'Custom footer should follow customer details');

    const beforeTotal = html.slice(0, totalIdx);
    assert.equal(beforeTotal.includes('Customer: Ada Lovelace'), false);
  });
});
