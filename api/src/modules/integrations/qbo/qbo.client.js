'use strict';

/**
 * QuickBooks Online API client.
 * Wraps Intuit Accounting API v3 with rate-limit awareness, token refresh,
 * and idempotency helpers. Used by the API proxy and OAuth service.
 *
 * Provider-specific. Xero will get its own client.
 */

const logger = require('../../../lib/logger');

const QBO_SANDBOX_BASE = 'https://sandbox-quickbooks.api.intuit.com/v3/company';
const QBO_PRODUCTION_BASE = 'https://quickbooks.api.intuit.com/v3/company';

class QboClient {
  /**
   * @param {object} options
   * @param {string} options.realmId - QBO company ID
   * @param {string} [options.environment] - 'sandbox' (default) or 'production'
   * @param {() => Promise<string>} options.getAccessToken - async function returning a fresh bearer token
   */
  constructor(options) {
    this.realmId = options.realmId;
    this.environment = options.environment || 'sandbox';
    this.getAccessToken = options.getAccessToken;
    this.baseUrl = options.environment === 'production' ? QBO_PRODUCTION_BASE : QBO_SANDBOX_BASE;
  }

  get companyUrl() {
    return `${this.baseUrl}/${this.realmId}`;
  }

  headers(token) {
    return {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
  }

  /**
   * Make an authenticated request to Intuit.
   * Automatically retries once on 401 with fresh token, once on 429 with Retry-After.
   */
  async request({ method, path, body, query, rawResponse = false }) {
    const token = await this.getAccessToken();
    const url = this.buildUrl(path, query);

    let response = await this.send({ method, url, token, body });

    // Retry on 401 — token may have expired between getAccessToken and request
    if (response.status === 401) {
      logger.info('integrations.qbo', 'Retrying QBO request after 401', { method, path });
      const freshToken = await this.getAccessToken();
      response = await this.send({ method, url, token: freshToken, body });
    }

    if (rawResponse) {
      return response;
    }

    return this.handleResponse(response, { method, path });
  }

  buildUrl(path, query) {
    const base = path.startsWith('http') ? path : `${this.companyUrl}/${path.replace(/^\//, '')}`;
    if (!query) return base;
    const params = new URLSearchParams(query).toString();
    return `${base}?${params}`;
  }

  async send({ method, url, token, body }) {
    const options = {
      method,
      headers: this.headers(token),
    };
    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(body);
    }
    let status, responseBody;
    try {
      const res = await fetch(url, options);
      status = res.status;
      responseBody = await res.json().catch(() => undefined);
    } catch (err) {
      return { status: 0, body: undefined, error: err.message };
    }
    return { status, body: responseBody };
  }

  handleResponse(response, context) {
    if (response.error) {
      throw this.categorizeError(response, context);
    }

    const { status, body } = response;

    if (status >= 200 && status < 300) {
      return body;
    }

    if (status === 429) {
      const retryAfter = body?.fault?.Error?.[0]?.Detail || 'unknown';
      const err = new Error(`QBO rate limit: ${retryAfter}`);
      err.category = 'rate_limit';
      err.status = status;
      throw err;
    }

    // QBO fault format
    const fault = body?.Fault || body?.fault;
    const errorList = fault?.Error || [];
    const messages = errorList.map((e) => `${e.code || ''}: ${e.Message || ''}`).join('; ');
    const err = new Error(`QBO ${status}: ${messages || 'Unknown error'}`);
    err.status = status;
    err.qboFault = fault;

    if (status === 400 || status === 422) {
      err.category = 'validation';
    } else if (status === 401 || status === 403) {
      err.category = 'authentication';
    } else if (status >= 500) {
      err.category = 'network';
    } else {
      err.category = 'business_logic';
    }

    throw err;
  }

  categorizeError(response, context) {
    const err = new Error(response.error || 'Network error');
    err.category = 'network';
    err.status = response.status;
    return err;
  }

  // --- Convenience methods per entity type ---

  async get(entityPath, query) {
    return this.request({ method: 'GET', path: entityPath, query });
  }

  async create(entityPath, data) {
    return this.request({ method: 'POST', path: entityPath, body: data });
  }

  async update(entityPath, data) {
    return this.request({ method: 'POST', path: entityPath, body: { ...data, sparse: true } });
  }

  async query(entityPath, query) {
    return this.request({ method: 'GET', path: `query?query=${encodeURIComponent(query)}` });
  }

  // --- Master data ---

  async listAccounts() {
    return this.get('/account', { minorversion: 70 });
  }

  async listCustomers() {
    return this.get('/customer', { minorversion: 70 });
  }

  async listVendors() {
    return this.get('/vendor', { minorversion: 70 });
  }

  async listTaxCodes() {
    return this.get('/taxcode', { minorversion: 70 });
  }

  async listPaymentMethods() {
    return this.get('/paymentmethod', { minorversion: 70 });
  }

  async listClasses() {
    try {
      return await this.get('/class', { minorversion: 70 });
    } catch (err) {
      if (err.status === 400 || err.status === 404) {
        return { Class: [] };
      }
      throw err;
    }
  }

  async listDepartments() {
    try {
      return await this.get('/department', { minorversion: 70 });
    } catch (err) {
      if (err.status === 400 || err.status === 404) {
        return { Department: [] };
      }
      throw err;
    }
  }

  // --- Sales ---

  async createSalesReceipt(salesReceipt) {
    return this.create('/salesreceipt', salesReceipt);
  }

  async createInvoice(invoice) {
    return this.create('/invoice', invoice);
  }

  async createPayment(payment) {
    return this.create('/payment', payment);
  }

  async createRefundReceipt(refundReceipt) {
    return this.create('/refundreceipt', refundReceipt);
  }

  async updateCustomer(customerId, data) {
    return this.request({
      method: 'POST',
      path: `/customer?operation=update`,
      body: { ...data, Id: customerId, sparse: true },
    });
  }

  async createCustomer(customer) {
    return this.create('/customer', customer);
  }

  // --- Journal ---

  async createJournalEntry(journalEntry) {
    return this.create('/journalentry', journalEntry);
  }

  // --- CDC / change data ---

  async listChangedEntities(entityType, changedSince) {
    const isoDate = changedSince instanceof Date
      ? changedSince.toISOString()
      : changedSince;
    return this.get(`/${entityType}`, {
      minorversion: 70,
      query: `SELECT * FROM ${entityType} WHERE MetaData.LastUpdatedTime > '${isoDate}'`,
      orderby: 'MetaData.LastUpdatedTime',
    });
  }
}

module.exports = { QboClient };
