'use strict';

class BaseGateway {
  constructor(name) {
    this.name = name;
    this.requiresPaymentTypeId = false;
    this.requiresIntentIdOnVerify = false;
    this.requiresServerConfig = false;
  }

  async createIntent(_payload) {
    throw new Error(`createIntent is not implemented for ${this.name}`);
  }

  async verify(_payload) {
    throw new Error(`verify is not implemented for ${this.name}`);
  }

  async handleWebhook(_payload) {
    throw new Error(`handleWebhook is not implemented for ${this.name}`);
  }

  mapCredentials(_config, _mode) {
    return null;
  }
}

module.exports = { BaseGateway };
