'use strict';

const express = require('express');
const { proxyRequest, testConnection, syncEvents } = require('./hikvision.proxy.controller');

const router = express.Router();

router.post('/proxy', proxyRequest);
router.post('/test-connection', testConnection);
router.post('/sync-events', syncEvents);

module.exports = router;
