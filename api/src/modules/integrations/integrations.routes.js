'use strict';

/**
 * Integrations module route mounting.
 *
 * Sessions routes (require JWT):
 *   /integrations/qbo/*         → QBO OAuth + proxy + status
 *   /integrations/hikvision/*   → Hikvision ISAPI Digest proxy
 *
 * Webhook routes (no JWT — vendor signature auth):
 *   /integrations/qbo/webhooks → QBO webhooks (raw body + Intuit signature)
 */

const express = require('express');
const qboRoutes = require('./qbo/qbo.routes');
const hikvisionRoutes = require('./hikvision/hikvision.routes');

const router = express.Router();

// Session-authenticated routes (server.js applies requireSession to /integrations)
router.use('/qbo', qboRoutes);
router.use('/hikvision', hikvisionRoutes);

module.exports = router;
