'use strict';


/**
 * Paint KOT / deletion header — mirrors kot-layout.printKotHeader.
 * @param {import('./raster-render').ReceiptCanvas} rc
 * @param {Object} opts
 */
function paintKotHeaderRaster(rc, opts) {
  const {
    kitchenName,
    bannerLabel,
    orderId,
    table,
    orderType,
    orderTaker,
    createdAt,
    extraLines = [],
    labels = {},
    showOrderType = true,
    showTableName = true,
  } = opts || {};

  const L = labels || {};
  const kotLabel = L.kot || 'KOT';
  const orderNumberLabel = L.orderNumber || 'Order#';
  const tableLabel = L.table || 'Table';
  const orderTypeLabel = L.orderType || 'Order Type';
  const orderTakerLabel = L.orderTaker || 'Order Taker';
  const timeLabel = L.time || 'Time';

  rc.centered(kitchenName || kotLabel, { size: 'medium', style: 'bold-underline' });
  rc.divider();

  const orderPart = orderId ? `${orderNumberLabel} ${orderId}` : '';
  const bannerPart = bannerLabel ? String(bannerLabel) : '';
  let orderBannerLine = '';
  if (orderPart && bannerPart) {
    orderBannerLine = `${orderPart} - ${bannerPart}`;
  } else {
    orderBannerLine = orderPart || bannerPart;
  }
  if (orderBannerLine) {
    rc.centered(orderBannerLine, { style: 'bold', size: 'normal' });
  }

  const tableLeft = showTableName !== false && table ? `${tableLabel}: ${table}` : '';
  const typeRight = showOrderType !== false && orderType
    ? `${orderTypeLabel}: ${orderType}`
    : '';
  if (tableLeft || typeRight) {
    rc.lineLeftRight(tableLeft, typeRight);
  }

  const takerLeft = orderTaker ? `${orderTakerLabel}: ${orderTaker}` : '';
  const timeRight = createdAt != null && createdAt !== '' ? `${timeLabel}: ${createdAt}` : '';
  if (takerLeft || timeRight) {
    rc.lineLeftRight(takerLeft, timeRight);
  }

  extraLines.forEach((line) => {
    if (line && line.value) {
      rc.fixedLine(`${line.label}: ${String(line.value)}`, { align: 'left' });
    }
  });

  rc.divider();
}

module.exports = { paintKotHeaderRaster };
