'use strict';

const express = require('express');
const { proxyInvoice } = require('./fiscal.controller');

const router = express.Router();

router.post('/invoice', proxyInvoice);

module.exports = router;
