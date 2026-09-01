export class IntegrationFrameworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntegrationFrameworkError';
  }
}

export class ProviderNotFoundError extends IntegrationFrameworkError {
  constructor(providerId: string) {
    super(`Provider not found: ${providerId}`);
    this.name = 'ProviderNotFoundError';
  }
}

export class ProviderVersionMismatchError extends IntegrationFrameworkError {
  constructor(providerId: string, minimumFrameworkVersion: string, frameworkVersion: string) {
    super(
      `Provider "${providerId}" requires framework ${minimumFrameworkVersion} but current framework is ${frameworkVersion}`
    );
    this.name = 'ProviderVersionMismatchError';
  }
}
