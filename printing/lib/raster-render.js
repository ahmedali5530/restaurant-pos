'use strict';

/**
 * Canvas-based receipt rasterizer (no Puppeteer).
 * Mirrors preview / bill layout structure for consistent cross-printer output.
 */

const {
  formatMoney,
  normalizeConfig,
  normalizeSections,
  formatPrintingTimestamp,
  decodeImageInput,
  resolvePaperWidthPx,
  formatFixedLine,
  formatLineLeftRight,
  formatDividerLine,
  formatCenteredHardwareLine,
  buildItemRowString,
  buildItemHeaderString,
  wrapReceiptText,
  STORE_LOGO_BOX_PX,
} = require('./receipt-helpers');
const { mapOrderToTemp, mapOrderToFinal, mapOrderToDelivery, mapOrderToRefund } = require('./order-mapping');
const { computeSummary, formatNum } = require('./summary-mapping');
const { ensureRasterFonts } = require('./raster-fonts');
const { getRasterMetrics, calibrateMetrics, buildCtxFont } = require('./raster-metrics');
const { paintBillLayoutRaster } = require('./raster-bill-layout');
const { paintKotHeaderRaster } = require('./raster-kot-layout');

function lineHeightForSize(metrics, size) {
  if (size === 'large') return metrics.lineHeightLarge;
  return metrics.lineHeightNormal;
}

function scaleForSize(metrics, size) {
  if (size === 'large') return { x: metrics.scaleLarge, y: metrics.scaleLarge };
  if (size === 'medium') return { x: metrics.scaleMedium, y: 1 };
  return { x: 1, y: 1 };
}

class ReceiptCanvas {
  /**
   * @param {number} width
   * @param {{ threshold?: number }} [opts]
   */
  constructor(width, opts) {
    const { createCanvas } = require('canvas');
    this.metrics = getRasterMetrics(width);
    this.width = this.metrics.paperWidthPx;
    this.threshold = opts && opts.threshold != null ? opts.threshold : 180;
    this.ops = [];
    this._estimatedH = this.metrics.lineHeightNormal;
    this._createCanvas = createCanvas;
  }

  _grow(h) {
    this._estimatedH += h != null ? h : this.metrics.lineHeightNormal;
  }

  _pushText(op) {
    this.ops.push({ type: 'text', ...op });
    this._grow(lineHeightForSize(this.metrics, op.size || 'normal'));
  }

  feed(n) {
    const lines = Math.max(0, Number(n) || 0);
    this.ops.push({ type: 'feed', n: lines });
    this._grow(lines * this.metrics.lineHeightNormal);
  }

  divider() {
    this._pushText({ text: formatDividerLine(), size: 'normal', align: 'left' });
  }

  /** @deprecated use fixedLine / lineLeftRight / centered */
  text(content, opts) {
    const o = opts || {};
    this.aligned(String(content || ''), o.align || 'left', {
      size: o.size || 'normal',
      style: o.bold ? 'bold' : undefined,
    });
  }

  /** @deprecated use lineLeftRight */
  row(left, right, opts) {
    this.lineLeftRight(left, right, opts);
  }

  fixedLine(text, opts) {
    const o = opts || {};
    this._pushText({
      text: formatFixedLine(text, o),
      size: o.size || 'normal',
      style: o.style,
      align: 'left',
    });
  }

  lineLeftRight(left, right, opts) {
    const o = opts || {};
    this._pushText({
      text: formatLineLeftRight(left, right, o),
      size: 'normal',
      style: o.style,
      align: 'left',
    });
  }

  centered(text, opts) {
    const payload = formatCenteredHardwareLine(text, opts);
    this._pushText(payload);
  }

  aligned(text, align, opts) {
    const o = opts || {};
    if (align === 'left') {
      this.fixedLine(text, { ...o, align: 'left' });
      return;
    }
    this.centered(text, o);
  }

  /**
   * @param {string|Buffer} input
   * @param {{ maxSide?: number, width?: number, height?: number }} [opts]
   */
  image(input, opts) {
    const o = opts || {};
    const width = o.width != null ? Math.max(8, Number(o.width) || STORE_LOGO_BOX_PX) : (o.maxSide || STORE_LOGO_BOX_PX);
    const height = o.height != null ? Math.max(8, Number(o.height) || STORE_LOGO_BOX_PX) : (o.maxSide || width);
    this.ops.push({ type: 'image', input, width, height, maxSide: o.maxSide });
    this._grow(height + 8);
  }

  /**
   * @param {string} value
   * @param {{ size?: number }} [opts]
   */
  qr(value, opts) {
    if (!value) return;
    this.ops.push({ type: 'qr', value: String(value), size: (opts && opts.size) || 4 });
    this._grow(Math.round(this.metrics.lineHeightNormal * 7));
  }

  /**
   * @returns {Promise<Buffer>}
   */
  async toPng() {
    const { loadImage } = require('canvas');
    const height = Math.max(32, this._estimatedH + 16);
    const canvas = this._createCanvas(this.width, height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, this.width, height);
    ctx.fillStyle = '#000000';
    ctx.textBaseline = 'top';

    const family = ensureRasterFonts();
    const metrics = calibrateMetrics(this.metrics, ctx);
    let y = 0;

    const drawText = (op) => {
      const size = op.size || 'normal';
      const style = op.style;
      const underline = style === 'bold-underline';
      const align = op.align || 'left';
      const { x: scaleX, y: scaleY } = scaleForSize(metrics, size);
      const fontPx = metrics.normalFontPx;
      const cols = metrics.printerWidth;
      // Layout cells span the full printable width (Mike42/ESC a character grid).
      // Glyph font may be slightly smaller (−4px) but still sits in these cells.
      const cellW = metrics.paperWidthPx / cols;

      ctx.save();
      ctx.font = buildCtxFont(false, fontPx, family);

      const maxChars = Math.max(1, Math.floor(cols / scaleX));
      const text = String(op.text || '').slice(0, maxChars);
      const usedCols = text.length * scaleX;

      let drawX = 0;
      if (align === 'center') {
        drawX = Math.round(Math.floor((cols - usedCols) / 2) * cellW);
      } else if (align === 'right') {
        drawX = Math.round(Math.max(0, cols - usedCols) * cellW);
      }

      // For left-aligned padAlign'd lines, advance glyphs on the cell grid so
      // 42 columns still fill the paper even when the TTF is slightly smaller.
      const glyphW = ctx.measureText('M').width || cellW;
      const needsStretch = scaleX !== 1 || scaleY !== 1;
      const srcH = Math.max(1, Math.ceil(fontPx * 1.35));
      const destH = Math.max(1, Math.round(srcH * scaleY));

      if (!text) {
        ctx.restore();
        y += lineHeightForSize(metrics, size);
        return;
      }

      if (align === 'left' && scaleX === 1 && scaleY === 1) {
        // Monospace cell advance: keep ESC/POS column alignment across the paper.
        let x = 0;
        for (let i = 0; i < text.length; i++) {
          const ch = text[i];
          if (ch !== ' ') {
            const cw = ctx.measureText(ch).width;
            ctx.fillText(ch, Math.round(x + Math.max(0, (cellW - cw) / 2)), y);
          }
          x += cellW;
        }
        if (underline) {
          ctx.fillRect(0, y + fontPx + 1, Math.round(text.length * cellW), Math.max(1, Math.round(fontPx * 0.06)));
        }
      } else if (needsStretch) {
        const measuredW = Math.max(1, Math.ceil(glyphW * text.length));
        const destW = Math.max(1, Math.round(usedCols * cellW));
        const off = this._createCanvas(measuredW, srcH);
        const octx = off.getContext('2d');
        octx.fillStyle = '#ffffff';
        octx.fillRect(0, 0, measuredW, srcH);
        octx.fillStyle = '#000000';
        octx.textBaseline = 'top';
        octx.font = buildCtxFont(false, fontPx, family);
        octx.fillText(text, 0, 0);
        if (underline) {
          octx.fillRect(0, fontPx + 1, measuredW, Math.max(1, Math.round(fontPx * 0.06)));
        }
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(off, drawX, y, destW, destH);
      } else {
        // Centered/right normal text: draw as a run starting at the column pad.
        const runW = ctx.measureText(text).width;
        const slotW = usedCols * cellW;
        const glyphPad = Math.max(0, (slotW - runW) / 2);
        ctx.fillText(text, Math.round(drawX + glyphPad), y);
        if (underline) {
          ctx.fillRect(
            Math.round(drawX + glyphPad),
            y + fontPx + 1,
            Math.ceil(runW),
            Math.max(1, Math.round(fontPx * 0.06))
          );
        }
      }
      ctx.restore();
      y += lineHeightForSize(metrics, size);
    };

    for (const op of this.ops) {
      if (op.type === 'feed') {
        y += op.n * metrics.lineHeightNormal;
        continue;
      }
      if (op.type === 'text') {
        drawText(op);
        continue;
      }
      if (op.type === 'image') {
        try {
          const decoded = decodeImageInput(op.input);
          if (!decoded) continue;
          const img = await loadImage(decoded.buf);
          const targetW = Math.max(8, Math.min(this.width, op.width || op.maxSide || STORE_LOGO_BOX_PX));
          const targetH = Math.max(8, op.height || op.maxSide || targetW);
          const w = Math.max(1, Math.floor(targetW));
          const h = Math.max(1, Math.floor(targetH));
          const x = Math.floor((this.width - w) / 2);
          ctx.drawImage(img, x, y, w, h);
          y += h + Math.round(metrics.lineHeightNormal * 0.35);
        } catch (e) {
          console.warn('[raster] image draw failed', e && e.message);
        }
        continue;
      }
      if (op.type === 'qr') {
        try {
          const qr = require('qr-image');
          const qrPng = qr.imageSync(op.value, { type: 'png', size: op.size || 4, margin: 1 });
          const img = await loadImage(qrPng);
          const maxSide = Math.min(150, this.width - 16);
          const scale = Math.min(1, maxSide / Math.max(img.width, img.height), this.width / img.width);
          const w = Math.max(1, Math.floor(img.width * scale));
          const h = Math.max(1, Math.floor(img.height * scale));
          const x = Math.floor((this.width - w) / 2);
          ctx.drawImage(img, x, y, w, h);
          y += h + Math.round(metrics.lineHeightNormal * 0.35);
        } catch (e) {
          console.warn('[raster] qr draw failed', e && e.message);
          drawText({ text: op.value.slice(0, 42), size: 'normal', align: 'center' });
        }
      }
    }

    const usedH = Math.max(32, Math.ceil((y + 8) / 8) * 8);
    const out = this._createCanvas(this.width, usedH);
    const octx = out.getContext('2d');
    octx.fillStyle = '#ffffff';
    octx.fillRect(0, 0, this.width, usedH);
    octx.drawImage(canvas, 0, 0);

    const imageData = octx.getImageData(0, 0, this.width, usedH);
    const d = imageData.data;
    // Slightly higher cutoff than user threshold — DejaVu strokes print heavier than Font A dots.
    const th = Math.min(255, this.threshold + 12);
    for (let i = 0; i < d.length; i += 4) {
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const v = lum < th ? 0 : 255;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    octx.putImageData(imageData, 0, 0);
    return out.toBuffer('image/png');
  }
}

function paintSections(rc, sections) {
  normalizeSections(sections)
    .filter((s) => s.enabled)
    .forEach((section) => {
      if (section.type === 'image' && section.content) {
        rc.image(section.content, {
          width: section.width || STORE_LOGO_BOX_PX,
          height: section.height || STORE_LOGO_BOX_PX,
        });
      } else if (section.type === 'text' && section.content) {
        wrapReceiptText(section.content, section.size || 'normal').forEach((line) => {
          rc.aligned(line, section.align || 'center', {
            size: section.size || 'normal',
          });
        });
      }
    });
}

function paintBranding(rc, cfg) {
  if (cfg.showLogo && cfg.logo) {
    rc.image(cfg.logo, {
      width: cfg.logoWidth || STORE_LOGO_BOX_PX,
      height: cfg.logoHeight || STORE_LOGO_BOX_PX,
    });
  }
  paintSections(rc, cfg.headerSections);
}

function paintFiscal(rc, qrcodes, qrcode) {
  const items = [];
  if (Array.isArray(qrcodes) && qrcodes.length) {
    qrcodes.forEach((item) => {
      if (item == null) return;
      if (typeof item === 'string') {
        const v = item.trim();
        if (v) items.push({ value: v, description: '', logo: '' });
        return;
      }
      const value = String(item.value ?? item.qrcode ?? '').trim();
      if (!value) return;
      items.push({
        value,
        description: String(item.description ?? '').trim(),
        logo: item.logo != null ? String(item.logo).trim() : '',
      });
    });
  } else if (qrcode) {
    items.push({ value: String(qrcode).trim(), description: '', logo: '' });
  }
  items.forEach((it) => {
    if (it.logo) rc.image(it.logo, { maxSide: 80 });
    rc.qr(it.value);
    if (it.description) {
      String(it.description)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => rc.centered(line, { size: 'normal' }));
    }
  });
}

/**
 * @param {Object} bill
 * @param {Object} config
 * @param {Object} opts
 * @returns {Promise<Buffer>}
 */
async function renderBillRaster(bill, config, opts) {
  const cfg = normalizeConfig(config || {});
  const o = opts || {};
  const L = cfg.labels || {};
  const width = resolvePaperWidthPx(cfg);
  const rc = new ReceiptCanvas(width, { threshold: cfg.rasterThreshold });

  const topFeed = Math.max(0, Number(cfg.topMargin) || 0);
  if (topFeed) rc.feed(topFeed);

  paintBranding(rc, cfg);
  paintBillLayoutRaster(rc, bill, cfg, {
    title: o.title,
    address: o.address,
    phone: o.phone,
    customerName: o.customerName,
    deliveryTime: o.deliveryTime,
    notes: o.notes || bill.note || bill.notes,
    thankYou: o.thankYou,
    showPayments: o.showPayments,
    showChange: o.showChange,
    showDeliveryLine: o.showDeliveryLine,
  });

  paintSections(rc, cfg.footerSections);

  const bottomFeed = Math.max(0, Number(cfg.bottomMargin) || 0);
  if (bottomFeed) rc.feed(bottomFeed);

  if (o.isFinal) {
    rc.divider();
    rc.centered(L.checkClosed || 'Check Closed', { style: 'bold', size: 'normal' });
  }

  paintFiscal(rc, o.qrcodes, o.qrcode);
  rc.feed(1);
  rc.centered(formatPrintingTimestamp(cfg), { size: 'normal' });
  rc.feed(3);

  return rc.toPng();
}

async function renderTempRaster(data, config) {
  const cfg = normalizeConfig(config || {});
  const order = data && data.order;
  if (!order) throw new Error('data.order is required for temp raster');
  const bill = mapOrderToTemp(order, {
    labels: cfg.labels,
    timezone: cfg.timezone,
    locale: cfg.locale,
    showInclusivePrices: !!cfg.showInclusivePrices,
  });
  return renderBillRaster(bill, cfg, {
    title: bill.title,
    notes: bill.note || undefined,
    showPayments: false,
    showChange: false,
    showDeliveryLine: false,
    qrcodes: data && data.qrcodes,
    qrcode: data && data.qrcode,
  });
}

async function renderFinalRaster(data, config) {
  const cfg = normalizeConfig(config || {});
  const order = data && data.order;
  if (!order) throw new Error('data.order is required for final raster');
  const bill = mapOrderToFinal(order, {
    duplicate: !!data.duplicate,
    labels: cfg.labels,
    timezone: cfg.timezone,
    locale: cfg.locale,
    showInclusivePrices: !!cfg.showInclusivePrices,
  });
  return renderBillRaster(bill, cfg, {
    title: bill.title,
    thankYou: bill.thankYou,
    showPayments: true,
    showChange: true,
    showDeliveryLine: false,
    isFinal: true,
    qrcodes: data && data.qrcodes,
    qrcode: data && data.qrcode,
  });
}

async function renderDeliveryRaster(data, config) {
  const cfg = normalizeConfig(config || {});
  const order = data && data.order;
  if (!order) throw new Error('data.order is required for delivery raster');
  const bill = mapOrderToDelivery(order, {
    labels: cfg.labels,
    timezone: cfg.timezone,
    locale: cfg.locale,
    showInclusivePrices: !!cfg.showInclusivePrices,
  });
  return renderBillRaster(bill, cfg, {
    title: bill.title,
    address: bill.address,
    phone: bill.phone,
    customerName: bill.customerName,
    deliveryTime: bill.deliveryTime,
    notes: bill.notes || undefined,
    showPayments: true,
    showChange: true,
    showDeliveryLine: true,
    qrcodes: data && data.qrcodes,
    qrcode: data && data.qrcode,
  });
}

async function renderRefundRaster(data, config) {
  const cfg = normalizeConfig(config || {});
  const L = cfg.labels || {};
  const sym = cfg.currencySymbol ?? '$';
  const refundOrder = data && data.order;
  const originalOrder = data && data.originalOrder;
  if (!refundOrder) throw new Error('data.order is required for refund raster');
  const bill = mapOrderToRefund(refundOrder, originalOrder, {
    showInclusivePrices: !!cfg.showInclusivePrices,
    timezone: cfg.timezone,
    locale: cfg.locale,
  });
  const width = resolvePaperWidthPx(cfg);
  const rc = new ReceiptCanvas(width, { threshold: cfg.rasterThreshold });
  const topFeed = Math.max(0, Number(cfg.topMargin) || 0);
  if (topFeed) rc.feed(topFeed);
  paintBranding(rc, cfg);

  const refundReceiptLabel = L.refundReceipt || 'REFUND RECEIPT';
  const originalInvoiceLabel = L.originalInvoice || 'Original Invoice#';
  const tableLabel = L.table || 'Table';
  const orderTypeLabel = L.orderType || 'Order Type';
  const cashierLabel = L.cashier || 'Cashier';
  const refundDateLabel = L.refundDate || 'Refund Date';
  const itemsLabel = L.items || 'Items';
  const taxLabel = L.tax || 'Tax';
  const discountLabel = L.discount || 'Discount';
  const extraLabel = L.extra || 'Extra';
  const tipLabel = L.tip || 'Tip';
  const refundTotalLabel = L.refundTotal || 'Refund Total';

  rc.centered(refundReceiptLabel, { size: 'normal', style: 'bold-underline' });
  rc.lineLeftRight(`${originalInvoiceLabel} ${bill.originalOrderId || ''}`, '');
  rc.lineLeftRight(`${tableLabel}: ${bill.table || '-'}`, `${orderTypeLabel}: ${bill.orderType || '-'}`);
  rc.lineLeftRight(`${cashierLabel}: ${bill.userName || '-'}`, '');
  rc.lineLeftRight(`${refundDateLabel}: ${bill.refundDate || ''}`, '');
  rc.divider();

  (bill.items || []).forEach((it) => {
    const name = (it.name || it.title || '').slice(0, 28);
    const qty = it.qty != null ? it.qty : 1;
    const lineTotal = it.total != null ? Number(it.total) : (it.price || 0) * qty;
    rc.lineLeftRight(`${name} x${qty}`, formatMoney(lineTotal, sym));
  });
  rc.divider();

  rc.lineLeftRight(`${itemsLabel} (${bill.itemsCount || 0})`, formatMoney(bill.itemsTotal, sym));
  if (bill.tax != null && Number(bill.tax) !== 0) {
    rc.lineLeftRight(`${taxLabel} (${bill.taxLabel || taxLabel})`, formatMoney(bill.tax, sym));
  }
  if (bill.discount && bill.discountAmount != null && Number(bill.discountAmount) !== 0) {
    rc.lineLeftRight(discountLabel, formatMoney(bill.discountAmount, sym));
  }
  if (bill.serviceChargeLabel && bill.serviceChargeAmount != null && Number(bill.serviceChargeAmount) !== 0) {
    rc.lineLeftRight(bill.serviceChargeLabel, formatMoney(bill.serviceChargeAmount, sym));
  }
  (bill.extras || []).forEach((e) => {
    rc.lineLeftRight(e.name || extraLabel, formatMoney(e.value, sym));
  });
  if (bill.tipAmount != null && Number(bill.tipAmount) !== 0) {
    rc.lineLeftRight(bill.tipLabel || tipLabel, formatMoney(bill.tipAmount, sym));
  }
  rc.divider();
  rc.lineLeftRight(refundTotalLabel, formatMoney(bill.total, sym), { style: 'bold-underline' });

  if (cfg.showVatNumber && cfg.vatNumber) {
    rc.centered(`${cfg.vatName}: ${cfg.vatNumber}`, { size: 'normal' });
  }

  paintSections(rc, cfg.footerSections);
  const bottomFeed = Math.max(0, Number(cfg.bottomMargin) || 0);
  if (bottomFeed) rc.feed(bottomFeed);
  rc.feed(1);
  rc.centered(formatPrintingTimestamp(cfg), { size: 'normal' });
  rc.feed(3);
  return rc.toPng();
}

async function renderKitchenRaster(data, config) {
  const cfg = normalizeConfig(config || {});
  const order = data && data.order;
  if (!order) throw new Error('data.order is required for kitchen raster');
  const {
    getOrderId,
    getOrderCreatedAt,
    getOrderItemModifierLines,
    getOrderUserName,
    getOrderType,
  } = require('./order-mapping');
  const width = resolvePaperWidthPx(cfg);
  const rc = new ReceiptCanvas(width, { threshold: cfg.rasterThreshold });
  const topFeed = Math.max(0, Number(cfg.topMargin) || 0);
  if (topFeed) rc.feed(topFeed);
  paintBranding(rc, cfg);

  const L = cfg.labels || {};
  const isAddOn = !!data.isAddOn;
  const isDuplicate = !!data.duplicate;
  const bannerLabel = isDuplicate
    ? (L.duplicateKot || 'COPY')
    : (isAddOn ? (L.addon || 'ADDON') : (L.newOrder || 'NEW'));

  paintKotHeaderRaster(rc, {
    kitchenName: data.kitchenName || L.kot || 'KOT',
    bannerLabel,
    orderId: getOrderId(order),
    table: data.table ? String(data.table.name || '') + String(data.table.number || '') : '',
    orderType: getOrderType(order),
    orderTaker: getOrderUserName(order),
    createdAt: getOrderCreatedAt(order, { timezone: cfg.timezone, locale: cfg.locale }),
    labels: L,
  });

  rc.fixedLine(buildItemHeaderString(cfg), { align: 'left', style: 'bold' });
  const items = Array.isArray(data.items) ? data.items : [];
  items.forEach((it) => {
    const dish = it.item || it.dish || {};
    const row = {
      name: dish.name || dish.title || '',
      qty: it.quantity != null ? it.quantity : 1,
      price: Number(it.price || 0),
      total: Number(it.price || 0) * (it.quantity != null ? it.quantity : 1),
      modifierLines: getOrderItemModifierLines(it),
    };
    rc.fixedLine(buildItemRowString(row, cfg), { align: 'left' });
    if (it.comments) {
      rc.fixedLine(` >> ${String(it.comments).slice(0, 26)}`, { align: 'left' });
    }
    if (Array.isArray(row.modifierLines)) {
      row.modifierLines.forEach((line) => {
        if (!line || line.name == null) return;
        const depth = typeof line.depth === 'number' ? line.depth : 0;
        const indent = '  '.repeat(1 + Math.max(0, depth));
        rc.fixedLine(indent + String(line.name).trim(), { align: 'left' });
      });
    }
  });

  const bottomFeed = Math.max(0, Number(cfg.bottomMargin) || 0);
  if (bottomFeed) rc.feed(bottomFeed);
  rc.feed(1);
  rc.centered(formatPrintingTimestamp(cfg), { size: 'normal' });
  rc.feed(3);
  return rc.toPng();
}

function pct(x, of) {
  const n = Number(of);
  return Number.isFinite(n) && n > 0 ? (Number(x) / n) * 100 : 0;
}

async function renderSummaryRaster(data, config) {
  const cfg = normalizeConfig(config || {});
  const L = cfg.labels || {};
  const sym = cfg.currencySymbol ?? '$';
  const s = computeSummary({
    ...(data || {}),
    timezone: cfg.timezone,
    locale: cfg.locale,
  });
  const width = resolvePaperWidthPx(cfg);
  const rc = new ReceiptCanvas(width, { threshold: cfg.rasterThreshold });
  const topFeed = Math.max(0, Number(cfg.topMargin) || 0);
  if (topFeed) rc.feed(topFeed);
  paintBranding(rc, cfg);
  const titleTemplate = L.summaryTitle || 'Daily sales summary — {{date}}';
  rc.centered(titleTemplate.replace('{{date}}', s.date), { size: 'normal', style: 'bold-underline' });
  rc.divider();
  const sect = (t) => {
    rc.divider();
    rc.centered(t, { size: 'normal', style: 'bold-underline' });
  };
  sect(L.salesRevenue || '1. Sales revenue');
  rc.lineLeftRight(L.exclusiveSales || 'Exclusive sales', formatMoney(s.exclusiveSales, sym));
  rc.lineLeftRight(L.extras || 'Extras', formatMoney(s.totalExtras, sym));
  rc.lineLeftRight(L.grossSales || 'Gross sales', formatMoney(s.grossSales, sym));
  rc.lineLeftRight(L.itemDiscounts || 'Item discounts', formatMoney(s.itemDiscounts, sym));
  rc.lineLeftRight(L.subtotalDiscounts || 'Subtotal discounts', formatMoney(s.subtotalDiscounts, sym));
  rc.lineLeftRight(L.couponDiscounts || 'Coupon discounts', formatMoney(s.couponDiscounts, sym));
  rc.lineLeftRight(L.discountsMinus || '(-) Discounts', formatMoney(s.discounts, sym));
  rc.lineLeftRight(L.netSales || 'Net sales', formatMoney(s.netSales, sym));
  sect(L.surchargesTaxes || '2. Surcharges and taxes');
  rc.lineLeftRight(L.serviceCharges || 'Service charges', formatMoney(s.serviceCharges, sym));
  rc.lineLeftRight(L.taxes || 'Taxes', formatMoney(s.taxCollected, sym));
  rc.lineLeftRight(L.totalRevenue || 'Total revenue', formatMoney(s.totalRevenue, sym), { style: 'bold-underline' });
  sect(L.settlementCashier || '3. Settlement and cashier');
  rc.lineLeftRight(L.amountDueBeforeTips || 'Amount due (before tips)', formatMoney(s.amountDue, sym));
  rc.lineLeftRight(L.tips || 'Tips', formatMoney(s.tips, sym));
  rc.lineLeftRight(L.grandTotalDue || 'Grand total (due)', formatMoney(s.grandTotalDue, sym), { style: 'bold-underline' });
  rc.lineLeftRight(L.amountCollected || 'Amount collected', formatMoney(s.amountCollected, sym));
  rc.lineLeftRight(L.rounding || 'Rounding', formatMoney(s.rounding, sym));
  rc.lineLeftRight(L.changeVariance || 'Change / variance', formatMoney(s.changeGiven, sym));
  sect(L.operationalControls || '4. Operational controls');
  rc.lineLeftRight(L.voids || 'Voids', formatMoney(s.voids, sym));
  rc.lineLeftRight(L.refunds || 'Refunds', formatMoney(s.refunds, sym));
  rc.lineLeftRight(L.covers || 'Covers', formatNum(s.covers));
  rc.lineLeftRight(L.averageCover || 'Average cover', formatMoney(s.averageCover, sym));
  rc.lineLeftRight(L.ordersChecks || 'Orders / checks', formatNum(s.ordersCount));
  rc.lineLeftRight(L.averageOrderCheck || 'Average order / check', formatMoney(s.averageOrderCheck, sym));
  sect(L.productMix || '5. Product mix');
  const ex = s.exclusiveSales;
  if (!s.categoryMix || s.categoryMix.length === 0) {
    rc.fixedLine(L.noCategoryData || 'No category data for this date.', { align: 'left' });
  } else {
    s.categoryMix.forEach((category) => {
      const catShare = `${formatNum(pct(category.total, ex))}%`;
      rc.lineLeftRight(
        String(category.name),
        `${formatNum(category.quantity)}  ${formatMoney(category.total, sym)}  ${catShare}`,
        { style: 'bold-underline' }
      );
      (category.dishes || []).forEach((dish) => {
        const dishShare = `${formatNum(pct(dish.total, ex))}%`;
        rc.lineLeftRight(
          `  ${String(dish.name)}`,
          `${formatNum(dish.quantity)}  ${formatMoney(dish.total, sym)}  ${dishShare}`
        );
      });
    });
  }
  sect(L.paymentTypes || '6. Payment types');
  (s.paymentTypes || []).filter((p) => Number(p.total) > 0).forEach((p) => {
    const share = `${formatNum(pct(p.total, s.amountDue))}%`;
    rc.lineLeftRight(String(p.name || ''), `${formatMoney(p.total, sym)}  ${share}`);
  });
  if (cfg.showVatNumber && cfg.vatNumber) {
    rc.centered(`${cfg.vatName}: ${cfg.vatNumber}`, { size: 'normal' });
  }
  paintSections(rc, cfg.footerSections);
  const bottomFeed = Math.max(0, Number(cfg.bottomMargin) || 0);
  if (bottomFeed) rc.feed(bottomFeed);
  rc.feed(1);
  rc.centered(formatPrintingTimestamp(cfg), { size: 'normal' });
  rc.feed(3);
  return rc.toPng();
}

/**
 * Render a print type to one or more PNG buffers (chunked by rasterMaxHeightPx).
 * @param {string} printType
 * @param {Object} data
 * @param {Object} config
 * @returns {Promise<Buffer[]>}
 */
async function renderRasterPngs(printType, data, config) {
  const cfg = normalizeConfig(config || {});
  const t = String(printType || (data && data.printType) || 'final').toLowerCase();

  let png;
  if (t === 'temp') png = await renderTempRaster(data, cfg);
  else if (t === 'final') png = await renderFinalRaster(data, cfg);
  else if (t === 'delivery') png = await renderDeliveryRaster(data, cfg);
  else if (t === 'refund') png = await renderRefundRaster(data, cfg);
  else if (t === 'kitchen') png = await renderKitchenRaster(data, cfg);
  else if (t === 'summary') png = await renderSummaryRaster(data, cfg);
  else {
    const err = new Error(`Raster not supported for print type: ${t}`);
    err.code = 'RASTER_UNSUPPORTED';
    throw err;
  }

  const maxH = cfg.rasterMaxHeightPx || 0;
  if (!maxH || maxH <= 0) return [png];

  const { loadImage, createCanvas } = require('canvas');
  const img = await loadImage(png);
  if (img.height <= maxH) return [png];

  const chunks = [];
  for (let y = 0; y < img.height; y += maxH) {
    const h = Math.min(maxH, img.height - y);
    const c = createCanvas(img.width, h);
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, y, img.width, h, 0, 0, img.width, h);
    chunks.push(c.toBuffer('image/png'));
  }
  return chunks;
}

module.exports = {
  ReceiptCanvas,
  renderRasterPngs,
  renderBillRaster,
  renderTempRaster,
  renderFinalRaster,
  renderDeliveryRaster,
  renderRefundRaster,
  renderKitchenRaster,
  renderSummaryRaster,
};
