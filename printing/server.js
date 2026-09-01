'use strict';

const express = require('express');
const cors = require('cors');
const { handlePrint } = require('./print-handler');
const { renderPreview } = require('./lib/preview');
const {
  createSessionAuthMiddleware,
  createCorsOriginDelegate,
} = require('./session-auth.middleware');

const app = express();
const PORT = process.env.PRINT_PORT || 3132;
const requireSession = createSessionAuthMiddleware();

app.use(cors({ origin: createCorsOriginDelegate() }));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'posr-print-server' });
});

app.post('/print/preview', requireSession, (req, res) => {
  try {
    const body = req.body || {};
    const { data = {}, config = {} } = body;
    const printType = data.printType || 'final';
    const html = renderPreview(printType, data, config);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    const msg = err && (err.message || String(err));
    res.status(400).setHeader('Content-Type', 'text/html; charset=utf-8').send(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Preview error</title></head><body><p>${String(msg).replace(/</g, '&lt;')}</p></body></html>`
    );
  }
});

app.get('/print/preview', (req, res) => {
  const tool = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Print preview</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 640px; margin: 20px auto; padding: 0 16px; }
    h1 { font-size: 1.2rem; }
    label { display: block; margin-top: 12px; }
    select { margin-left: 8px; }
    textarea { width: 100%; height: 240px; font: 12px/1.4 monospace; padding: 8px; box-sizing: border-box; }
    button { margin-top: 12px; padding: 8px 16px; }
  </style>
</head>
<body>
  <h1>Receipt preview</h1>
  <p>Same JSON as <code>POST /print</code> (printers ignored). Choose type and paste <code>data</code> + <code>config</code>.</p>
  <label>Print type <select id="pt"><option value="temp">temp (Pre-Sale)</option><option value="final">final</option><option value="delivery">delivery</option><option value="kitchen">kitchen</option><option value="summary">summary</option><option value="refund">refund</option></select></label>
  <label>JSON body (must include <code>data</code> with <code>order</code>; for refund include <code>data.originalOrder</code> too)</label>
  <textarea id="json">{
  "data": {
    "printType": "final",
    "order": {
      "invoice_number": 286,
      "created_at": "2026-01-17T23:52:00",
      "table": { "name": "T", "number": "2" },
      "user": { "first_name": "Kashif", "last_name": "ali" },
      "items": [
        { "item": { "name": "Daal chawal" }, "quantity": 1, "price": 234 },
        { "item": { "name": "Raita + Salad" }, "quantity": 1, "price": 234 }
      ],
      "tax": { "name": "GST", "rate": 17 },
      "tax_amount": 79.56,
      "service_charge": 1,
      "service_charge_type": "Fixed",
      "service_charge_amount": 1,
      "delivery": { "delivery_charges": 149 },
      "payments": [{ "payment_type": { "name": "Cash" }, "amount": 697.56 }]
    }
  },
  "config": { "currencySymbol": "$", "showVatNumber": true, "vatName": "NTN", "vatNumber": "12356789" }
}</textarea>
  <button id="btn">Preview</button>
  <script>
    document.getElementById('btn').onclick = function() {
      const pt = document.getElementById('pt').value;
      let body;
      try { body = JSON.parse(document.getElementById('json').value); } catch (e) { alert('Invalid JSON'); return; }
      body.data = body.data || {};
      body.data.printType = pt;
      fetch('/print/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(function(r) { return r.text(); })
        .then(function(html) { var w = window.open('', '_blank'); w.document.write(html); w.document.close(); })
        .catch(function(e) { alert('Error: ' + e.message); });
    };
  </script>
</body>
</html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(tool);
});

app.post('/print', requireSession, async (req, res) => {
  try {
    const body = req.body;

    if (!body || typeof body !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Request body must be a JSON object with "printers" and "data"',
      });
    }

    const result = await handlePrint(body);
    const status = result.success ? 200 : 207;
    res.status(status).json(result);
  } catch (err) {
    const message = err && (err.message || String(err));
    res.status(400).json({ success: false, error: message });
  }
});

const HOST = process.env.PRINT_HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`Print server listening on http://${HOST}:${PORT}`);
  console.log('POST /print with JSON: { printers: [...], data: { printType, ... } }');
  console.log('GET /print/preview - preview tool in browser');
  console.log('POST /print/preview - same body as /print, returns HTML receipt preview');
});
