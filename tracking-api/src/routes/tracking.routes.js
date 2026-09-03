'use strict';

const express = require('express');
const { createTracking } = require('../services/tracking.service');

const router = express.Router();

router.post('/', async (req, res, next) => {
  try {
    const body = req.body || {};
    if (typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({
        success: false,
        error: 'Tracking payload must be a JSON object',
      });
    }

    const created = await createTracking(body);
    return res.status(201).json({
      success: true,
      data: created,
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
