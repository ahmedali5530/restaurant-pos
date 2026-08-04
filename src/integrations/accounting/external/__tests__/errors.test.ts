import { describe, expect, it } from 'vitest';
import { categorizeExternalError, isRetriableExternalError, formatSyncFailure } from '@/integrations/accounting/external/errors.ts';

describe('categorizeExternalError', () => {
  it('categorizes 429 as rate_limit', () => {
    expect(categorizeExternalError({ status: 429, message: 'Too many requests' })).toBe('rate_limit');
  });

  it('categorizes 401 as authentication', () => {
    expect(categorizeExternalError({ status: 401, message: 'Unauthorized' })).toBe('authentication');
  });

  it('categorizes 403 as authentication', () => {
    expect(categorizeExternalError({ status: 403, message: 'Forbidden' })).toBe('authentication');
  });

  it('categorizes 400 as validation', () => {
    expect(categorizeExternalError({ status: 400, message: 'Bad Request' })).toBe('validation');
  });

  it('categorizes 422 as validation', () => {
    expect(categorizeExternalError({ status: 422, message: 'Validation error' })).toBe('validation');
  });

  it('categorizes 500+ as network', () => {
    expect(categorizeExternalError({ status: 500, message: 'Internal Server Error' })).toBe('network');
  });

  it('categorizes network errors (status 0) as network', () => {
    expect(categorizeExternalError({ status: 0, message: 'fetch failed' })).toBe('network');
  });

  it('categorizes timeout as network', () => {
    expect(categorizeExternalError({ message: 'Request timeout' })).toBe('network');
  });

  it('categorizes ECONNREFUSED as network', () => {
    expect(categorizeExternalError({ message: 'ECONNREFUSED' })).toBe('network');
  });

  it('categorizes invalid_grant as authentication', () => {
    expect(categorizeExternalError({ message: 'invalid_grant: Token expired' })).toBe('authentication');
  });

  it('categorizes expired token as authentication', () => {
    expect(categorizeExternalError({ message: 'token expired' })).toBe('authentication');
  });

  it('categorizes duplicate as business_logic', () => {
    expect(categorizeExternalError({ message: 'duplicate entry' })).toBe('business_logic');
  });

  it('categorizes not found as business_logic', () => {
    expect(categorizeExternalError({ message: 'entity not found' })).toBe('business_logic');
  });

  it('respects explicit category on error object', () => {
    const err: any = new Error('Something went wrong');
    err.category = 'authentication';
    expect(categorizeExternalError(err)).toBe('authentication');
  });

  it('categorizes unknown errors as unknown', () => {
    expect(categorizeExternalError({ message: 'something weird happened' })).toBe('unknown');
  });

  it('categorizes null as unknown', () => {
    expect(categorizeExternalError(null)).toBe('unknown');
  });
});

describe('isRetriableExternalError', () => {
  it('rate_limit is retriable', () => {
    expect(isRetriableExternalError('rate_limit')).toBe(true);
  });

  it('network is retriable', () => {
    expect(isRetriableExternalError('network')).toBe(true);
  });

  it('authentication is not retriable', () => {
    expect(isRetriableExternalError('authentication')).toBe(false);
  });

  it('validation is not retriable', () => {
    expect(isRetriableExternalError('validation')).toBe(false);
  });

  it('business_logic is not retriable', () => {
    expect(isRetriableExternalError('business_logic')).toBe(false);
  });

  it('unknown is not retriable', () => {
    expect(isRetriableExternalError('unknown')).toBe(false);
  });
});

describe('formatSyncFailure', () => {
  it('formats a failure record with all fields', () => {
    const result = formatSyncFailure(
      'provider:quickbooks',
      'realm-123',
      'sales_receipt',
      'order:42',
      'syncSale',
      { message: 'Validation failed', status: 400 }
    );

    expect(result.provider_id).toBe('provider:quickbooks');
    expect(result.tenant_id).toBe('realm-123');
    expect(result.entity_type).toBe('sales_receipt');
    expect(result.posr_id).toBe('order:42');
    expect(result.action).toBe('syncSale');
    expect(result.error).toBe('Validation failed');
    expect(result.error_category).toBe('validation');
    expect(result.retriable).toBe(false);
    expect(result.retry_count).toBe(0);
    expect(result.created_at).toBeTruthy();
  });

  it('marks network errors as retriable', () => {
    const result = formatSyncFailure('p', 't', 'e', 'id', 'action', { message: 'ECONNREFUSED' });
    expect(result.retriable).toBe(true);
    expect(result.error_category).toBe('network');
  });
});
