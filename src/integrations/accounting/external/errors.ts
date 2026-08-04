import { ExternalErrorCategory } from '@/integrations/accounting/external/types.ts';

/**
 * Categorize an error from a remote accounting API into a shared category.
 * Provider adapters call this to keep the framework agnostic.
 * The framework uses categories for retry decisions and audit logs.
 */
export const categorizeExternalError = (err: unknown): ExternalErrorCategory => {
  if (!err || typeof err !== 'object') {
    return 'unknown';
  }

  const error = err as Record<string, unknown>;

  if (error.category && typeof error.category === 'string') {
    const cat = error.category as string;
    if (['authentication', 'validation', 'rate_limit', 'network', 'business_logic', 'unknown'].includes(cat)) {
      return cat as ExternalErrorCategory;
    }
  }

  const message = String(error.message ?? '').toLowerCase();
  const hasStatus = 'status' in error || 'statusCode' in error;
  const status = hasStatus ? Number(error.status ?? error.statusCode ?? -1) : -1;

  // Rate limiting
  if (status === 429 || message.includes('rate limit') || message.includes('too many requests') || message.includes('throttle')) {
    return 'rate_limit';
  }

  // Authentication
  if (status === 401 || status === 403 || message.includes('unauthorized') || message.includes('unauthenticated') || message.includes('invalid token') || message.includes('expired') || message.includes('invalid_grant')) {
    return 'authentication';
  }

  // Validation
  if (status === 400 || status === 422 || message.includes('validation') || message.includes('invalid') || message.includes('required') || message.includes('missing field') || message.includes('bad request')) {
    return 'validation';
  }

  // Network — explicit status codes or message keywords
  if (
    status === 0 || status === 408 || status >= 500 ||
    message.includes('timeout') || message.includes('timed out') || message.includes('network') ||
    message.includes('econnrefused') || message.includes('enotfound') ||
    message.includes('fetch failed') || message.includes('abort')
  ) {
    return 'network';
  }

  // Business logic errors from the remote system
  if (message.includes('business') || message.includes('duplicate') || message.includes('constraint') || message.includes('not found')) {
    return 'business_logic';
  }

  return 'unknown';
};

/**
 * Determine whether an error is retriable based on its category.
 */
export const isRetriableExternalError = (category: ExternalErrorCategory): boolean => {
  return category === 'rate_limit' || category === 'network';
};

/**
 * Format an error for the integration_sync_failure table.
 */
export const formatSyncFailure = (
  providerId: string,
  tenantId: string,
  entityType: string,
  posrId: string,
  action: string,
  err: unknown
): Record<string, unknown> => {
  const error = err as Record<string, unknown> | undefined;
  const category = categorizeExternalError(err);

  return {
    provider_id: providerId,
    tenant_id: tenantId,
    entity_type: entityType,
    posr_id: posrId,
    action,
    error: String(error?.message ?? 'Unknown error'),
    error_category: category,
    retriable: isRetriableExternalError(category),
    retry_count: 0,
    created_at: new Date().toISOString(),
  };
};
