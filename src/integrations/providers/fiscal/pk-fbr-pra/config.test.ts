import { describe, it, expect } from 'vitest';
import { parsePkFiscalProviderConfig } from './config.ts';

/**
 * Tests for parsePkFiscalProviderConfig — the config validation function
 * that guards against misconfigured FBR/PRA fiscal credentials.
 *
 * Previously untested. This function validates:
 *   - apiBaseUrl is required + must be a valid http(s) URL
 *   - copy-paste quotes/zero-width chars are stripped from URLs
 *   - bearerToken, posId, defaultPctCode are required
 *   - sellerNtn is required when requireSellerNtn=true (FBR only)
 *   - invoiceType defaults to 1
 *   - punjabMode defaults to false
 *   - offlineBuffering/requestTimeoutSeconds/blockSettlementOnFailure/qrPriority
 *     come from parseFiscalRuntimeConfig defaults
 */

const VALID_CONFIG = {
  apiBaseUrl: 'https://ims.fbr.gov.pk/api/Live/PostData/',
  bearerToken: 'valid-bearer-token-abc123',
  posId: 'POS-001',
  defaultPctCode: 'PCT-12345',
  sellerNtn: '1234567-8',
};

describe('parsePkFiscalProviderConfig', () => {
  describe('valid config', () => {
    it('returns a parsed config when all required fields are present', () => {
      const result = parsePkFiscalProviderConfig(VALID_CONFIG);
      expect('error' in result).toBe(false);
      if ('error' in result) return;
      expect(result.apiBaseUrl).toBe('https://ims.fbr.gov.pk/api/Live/PostData/');
      expect(result.bearerToken).toBe('valid-bearer-token-abc123');
      expect(result.posId).toBe('POS-001');
      expect(result.defaultPctCode).toBe('PCT-12345');
      expect(result.invoiceType).toBe(1);
      expect(result.punjabMode).toBe(false);
    });

    it('defaults invoiceType to 1 when not specified', () => {
      const result = parsePkFiscalProviderConfig(VALID_CONFIG);
      if ('error' in result) return;
      expect(result.invoiceType).toBe(1);
    });

    it('accepts a custom invoiceType', () => {
      const result = parsePkFiscalProviderConfig({ ...VALID_CONFIG, invoiceType: 2 });
      if ('error' in result) return;
      expect(result.invoiceType).toBe(2);
    });

    it('falls back to invoiceType=1 when value is invalid', () => {
      const result = parsePkFiscalProviderConfig({ ...VALID_CONFIG, invoiceType: 'invalid' });
      if ('error' in result) return;
      expect(result.invoiceType).toBe(1);
    });
  });

  describe('apiBaseUrl validation', () => {
    it('returns error when apiBaseUrl is missing', () => {
      const result = parsePkFiscalProviderConfig({ ...VALID_CONFIG, apiBaseUrl: '' });
      expect('error' in result).toBe(true);
      if ('error' in result) expect(result.error).toContain('apiBaseUrl');
    });

    it('returns error when apiBaseUrl is not a URL', () => {
      const result = parsePkFiscalProviderConfig({ ...VALID_CONFIG, apiBaseUrl: 'not-a-url' });
      expect('error' in result).toBe(true);
      if ('error' in result) expect(result.error).toContain('http(s)');
    });

    it('returns error for non-http protocol (e.g. ftp)', () => {
      const result = parsePkFiscalProviderConfig({ ...VALID_CONFIG, apiBaseUrl: 'ftp://files.example.com' });
      expect('error' in result).toBe(true);
      if ('error' in result) expect(result.error).toContain('http(s)');
    });

    it('strips double quotes from copy-pasted URLs', () => {
      const result = parsePkFiscalProviderConfig({
        ...VALID_CONFIG,
        apiBaseUrl: '"https://ims.fbr.gov.pk/api/Live/PostData/"',
      });
      if ('error' in result) return;
      expect(result.apiBaseUrl).toBe('https://ims.fbr.gov.pk/api/Live/PostData/');
    });

    it('strips single quotes from copy-pasted URLs', () => {
      const result = parsePkFiscalProviderConfig({
        ...VALID_CONFIG,
        apiBaseUrl: "'https://ims.fbr.gov.pk/api/Live/PostData/'",
      });
      if ('error' in result) return;
      expect(result.apiBaseUrl).toBe('https://ims.fbr.gov.pk/api/Live/PostData/');
    });

    it('strips zero-width characters from URLs', () => {
      const result = parsePkFiscalProviderConfig({
        ...VALID_CONFIG,
        apiBaseUrl: 'https://\u200Bims\u200B.fbr.gov.pk',
      });
      if ('error' in result) return;
      expect(result.apiBaseUrl).toBe('https://ims.fbr.gov.pk');
    });

    it('strips non-breaking spaces from URLs', () => {
      const result = parsePkFiscalProviderConfig({
        ...VALID_CONFIG,
        apiBaseUrl: 'https://\u00A0ims.fbr.gov.pk',
      });
      if ('error' in result) return;
      expect(result.apiBaseUrl).toBe('https://ims.fbr.gov.pk');
    });
  });

  describe('required field validation', () => {
    it('returns error when bearerToken is missing', () => {
      const result = parsePkFiscalProviderConfig({ ...VALID_CONFIG, bearerToken: '' });
      expect('error' in result).toBe(true);
      if ('error' in result) expect(result.error).toContain('bearerToken');
    });

    it('returns error when posId is missing', () => {
      const result = parsePkFiscalProviderConfig({ ...VALID_CONFIG, posId: '' });
      expect('error' in result).toBe(true);
      if ('error' in result) expect(result.error).toContain('posId');
    });

    it('returns error when defaultPctCode is missing', () => {
      const result = parsePkFiscalProviderConfig({ ...VALID_CONFIG, defaultPctCode: '' });
      expect('error' in result).toBe(true);
      if ('error' in result) expect(result.error).toContain('defaultPctCode');
    });
  });

  describe('sellerNtn validation', () => {
    it('does NOT require sellerNtn when requireSellerNtn is false (PRA)', () => {
      const result = parsePkFiscalProviderConfig(
        { ...VALID_CONFIG, sellerNtn: undefined },
        { requireSellerNtn: false }
      );
      expect('error' in result).toBe(false);
      if ('error' in result) return;
      expect(result.sellerNtn).toBeUndefined();
    });

    it('requires sellerNtn when requireSellerNtn is true (FBR)', () => {
      const result = parsePkFiscalProviderConfig(
        { ...VALID_CONFIG, sellerNtn: '' },
        { requireSellerNtn: true }
      );
      expect('error' in result).toBe(true);
      if ('error' in result) expect(result.error).toContain('sellerNtn');
    });

    it('accepts sellerNtn when provided + requireSellerNtn is true', () => {
      const result = parsePkFiscalProviderConfig(
        { ...VALID_CONFIG, sellerNtn: '1234567-8' },
        { requireSellerNtn: true }
      );
      expect('error' in result).toBe(false);
      if ('error' in result) return;
      expect(result.sellerNtn).toBe('1234567-8');
    });
  });

  describe('runtime config passthrough', () => {
    it('passes offlineBuffering from runtime config', () => {
      const result = parsePkFiscalProviderConfig({ ...VALID_CONFIG, offlineBuffering: true });
      if ('error' in result) return;
      expect(result.offlineBuffering).toBe(true);
    });

    it('passes blockSettlementOnFailure from runtime config', () => {
      const result = parsePkFiscalProviderConfig({ ...VALID_CONFIG, blockSettlementOnFailure: true });
      if ('error' in result) return;
      expect(result.blockSettlementOnFailure).toBe(true);
    });

    it('passes qrPriority from runtime config', () => {
      const result = parsePkFiscalProviderConfig({ ...VALID_CONFIG, qrPriority: 100 });
      if ('error' in result) return;
      expect(result.qrPriority).toBe(100);
    });
  });

  describe('punjabMode', () => {
    it('defaults to false', () => {
      const result = parsePkFiscalProviderConfig(VALID_CONFIG);
      if ('error' in result) return;
      expect(result.punjabMode).toBe(false);
    });

    it('accepts true (FBR Punjab mode)', () => {
      const result = parsePkFiscalProviderConfig({ ...VALID_CONFIG, punjabMode: true });
      if ('error' in result) return;
      expect(result.punjabMode).toBe(true);
    });
  });
});
