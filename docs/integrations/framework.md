# Generic Integration Framework

## Overview

The Integration Framework is a core subsystem under `src/integrations` that allows external providers to be installed, configured, and executed without coupling provider logic to POS business flows.

Core principles:
- Provider/plugin based
- Event driven
- Offline first with persisted queue
- Capability-based contracts
- Manifest-driven configuration UI
- Health and audit visibility

## Package Structure

```text
src/integrations/
  core/
  events/
  registry/
  queue/
  scheduler/
  configuration/
  security/
  health/
  audit/
  transport/
  storage/
  providers/
    fiscal/
      fbr/
      pra/
```

## Provider Lifecycle

1. Discover bundled providers (`BundledProviderDiscovery`)
2. Register provider in `ProviderRegistry`
3. Validate compatibility and capabilities
4. Initialize provider
5. Execute provider actions through queue jobs
6. Run health checks and publish status
7. Shutdown provider on app teardown

## Contracts

- `IntegrationProvider` defines all lifecycle and capability hooks.
- `ProviderManifest` defines metadata, compatibility, features, and dynamic settings schema.
- `IntegrationExecutionRequest/Response` define execution payloads.
- `IntegrationHealthSnapshot` standardizes monitoring.

## Class Diagram

```mermaid
classDiagram
  class IntegrationManager {
    +installProviders(providers)
    +execute(providerId, request)
    +processQueue()
    +publish(event)
    +refreshHealth()
  }
  class ProviderRegistry {
    +register(provider)
    +get(providerId)
    +getInstalledManifests()
  }
  class IntegrationEventBus {
    +subscribe(eventName, handler)
    +publish(event)
  }
  class IntegrationQueueEngine {
    +enqueue(job)
    +processNext(executor)
    +listActiveJobs()
  }
  class SchedulerEngine {
    +register(job)
    +unregister(jobId)
    +shutdown()
  }
  class HealthMonitor {
    +collect(provider)
    +list()
  }
  class IntegrationAuditLogger {
    +log(event)
  }
  class IntegrationProvider {
    <<interface>>
    +initialize()
    +shutdown()
    +getManifest()
    +execute(request, context)
    +healthCheck()
    +handleEvent(event)
  }

  IntegrationManager --> ProviderRegistry
  IntegrationManager --> IntegrationEventBus
  IntegrationManager --> IntegrationQueueEngine
  IntegrationManager --> SchedulerEngine
  IntegrationManager --> HealthMonitor
  IntegrationManager --> IntegrationAuditLogger
  ProviderRegistry --> IntegrationProvider
```

## Sequence Diagram (Event to Provider Execution)

```mermaid
sequenceDiagram
  participant PosCore
  participant IntegrationManager
  participant QueueEngine
  participant Provider
  participant AuditLogger

  PosCore->>IntegrationManager: execute(providerId, action, payload)
  IntegrationManager->>QueueEngine: enqueue(job)
  IntegrationManager->>AuditLogger: log(Request)
  QueueEngine->>Provider: execute(request, context)
  Provider-->>QueueEngine: response
  QueueEngine-->>IntegrationManager: completed/failed
  IntegrationManager->>AuditLogger: log(Response/Failure)
```

## Event Model

- Framework supports normalized events (`IntegrationEvent`) and provider subscriptions.
- POS can publish events such as `InvoiceCreated`, `InvoicePaid`, `OrderCreated`, `ShiftClosed`, `InternetDisconnected`.
- Providers handle only events they declare in `manifest.supportedEvents`.

## Queue and Retry

- Queue states: `Pending`, `Running`, `Waiting`, `Completed`, `Failed`, `Cancelled`, `DeadLetter`
- Exponential backoff with optional jitter
- Dedupe support via `dedupeKey`
- IndexedDB persistence via `IndexedDbQueueStore`

## Scheduler

- Providers can register recurring jobs through `SchedulerEngine`
- Use for token refresh, heartbeat, sync, cleanup, and health polling

## Security Layer

- Secret abstraction: `SecretStore`
- Current implementation: `IndexedDbSecretStore`
- Supports auth modes in manifest: API key, OAuth, JWT, certificate, mTLS

## Health Monitoring

`HealthMonitor` collects:
- Connection/auth status
- Average response time
- Pending/failed jobs
- Last sync and cert expiry

## Audit Logging

`IntegrationAuditLogger` writes events to existing tracking pipeline (`postTracking`) for:
- Provider install/remove/update
- Request/response/retry/failure
- Auth and health changes

## Dynamic Settings Renderer

- UI uses `manifest.configurationSchema` to render fields dynamically.
- Supports types:
  - text, number, password
  - checkbox/switch
  - dropdown
  - certificate
  - json
  - dynamic (custom fallback)

## Database Design

Migration file: `migrations/2026_07_08_integrations_framework.surql`

Tables:
- `integration_provider`
- `integration_provider_config`
- `integration_installed_provider`
- `integration_queue`
- `integration_queue_attempt`
- `integration_provider_health`
- `integration_provider_secret`
- `integration_provider_certificate`
- `integration_provider_webhook`
- `integration_schedule`
- `integration_execution_history`

## Example Providers (Phase 1)

- `provider:fbr`
- `provider:pra`

Both are fiscal providers with manifest-driven configuration and shared framework contracts.

### Provider-specific adapters (important)

Config parsing, invoice serialization, auth headers, and response parsing are **not** generic across authorities.

- Pakistan FBR/PRA share [`src/integrations/providers/fiscal/pk-fbr-pra/`](src/integrations/providers/fiscal/pk-fbr-pra/) (`serializePkFiscalInvoice`, `parsePkFiscalProviderConfig`, `submitPkFiscalInvoiceRequest`).
- Shared across all fiscal providers: settlement orchestration + junction QR storage + [`parseFiscalRuntimeConfig`](src/integrations/providers/fiscal/shared/runtime-config.ts) (`offlineBuffering`, `blockSettlementOnFailure`, timeout only).
- Settlement only requires `IntegrationExecutionResponse.data` shaped as `{ invoiceNumber?, qrcode?, code?, request?, response? }`.
- Future authorities (ZATCA, Kenya KRA/eTIMS) must add their own folder under `providers/fiscal/` with their own config/serialize/submit — do not extend the PK adapter.

### Fiscal settlement and final-print QR

When one or more fiscal providers are **enabled**, order settlement submits invoices before final print:

1. `OrderPaymentReceiving.closeOrder` (and auto-check-close) calls `submitFiscalInvoices`.
2. Each enabled fiscal provider runs `executeImmediate` with action `invoiceSubmission`.
3. FBR/PRA serialize the Pakistan JSON payload and POST with `Authorization: Bearer <bearerToken>`.
4. Success requires authority `Code == 100`; `InvoiceNumber` is stored and used as QR.
5. Among successful submissions, print QR is chosen by highest shared runtime `qrPriority` (not hardcoded provider ids). PRA defaults to `100`, FBR to `50`, so PRA still wins when both succeed unless config overrides.
6. Each attempt is stored as a row in `integration_order_fiscal` (junction), including `qr_priority`. One row may be marked `selected_for_print`.
7. Final bill print resolves QR via `resolveFiscalQrcodeForPrint` (`selected_for_print` → highest `qr_priority` success) and passes it into `dispatchPrint` / `final-print.js`.

Junction table (migration `2026_07_11_order_fiscal_fields.surql`):
- `integration_order_fiscal`: `order`, `provider_id`, `invoice_number`, `qrcode`, `status`, `code`, `error`, `selected_for_print`, `qr_priority`, `request_payload`, `response_payload`, `submitted_at`
- Use `setFiscalSubmissionSelectedForPrint(db, orderId, submissionId)` to print a non-default QR on reprints.

### Pakistan FBR/PRA config fields

| Field | Purpose |
|-------|---------|
| `apiBaseUrl` | Invoice POST endpoint |
| `bearerToken` | `Authorization: Bearer …` |
| `posId` | `POSID` |
| `defaultPctCode` | Line `PCTCode` for all items (Phase 1; no per-product PCT yet) |
| `invoiceType` | Default `1` |
| `offlineBuffering` | Shared runtime: queue failed immediate submits |
| `blockSettlementOnFailure` | Shared runtime: abort Paid until fiscal succeeds |
| `qrPriority` | Shared runtime: higher value wins print QR when multiple succeed (PRA default `100`, FBR default `50`) |
| `punjabMode` (FBR only) | Line `TotalAmount = Quantity × SaleValue` |

FBR also requires `sellerNtn`. USIN uses `order.invoice_number`.

### Manager APIs

- `execute(providerId, request)` — enqueue only (async)
- `executeImmediate(providerId, request)` — sync execute for settlement/QR; on failure + offline buffering, also enqueues retry

## Unit Test Strategy

1. Contract validation for provider manifest/capabilities
2. Queue transitions and retry delay calculations
3. Registry version compatibility checks
4. Manager execution path (enqueue + process)
5. Fiscal serializer (PRA/FBR TotalAmount + Punjab mode) and PRA-preferred QR selection
6. FBR HTTP execute with Bearer auth and Code 100 parsing

## Integration Test Strategy

1. Boot manager with multiple providers and process queued jobs
2. Offline simulation with waiting jobs and delayed retries
3. Health collection and audit emission during execution lifecycle

## Provider Catalog vs Runtime State

- `PROVIDER_CATALOG` is the code-level provider registry. Adding a new provider here requires a rebuild.
- `integration_installed_provider` is runtime state. Toggling `enabled` here does not require any rebuild.
- New catalog providers are synced as `enabled: false` by default until an admin enables them.
- Configure credentials (including `bearerToken`) before enabling; enable runs `validate()` against saved settings.

## Provider Migration Guide (Add New Provider)

1. Create provider class implementing `IntegrationProvider`.
2. Define `ProviderManifest` and `configurationSchema`.
3. Add provider factory to `PROVIDER_CATALOG`.
4. Implement `execute`, `healthCheck`, and event handlers as needed.
5. Add provider compliance tests (manifest + execute + health).
6. Enable the provider from Integrations admin and validate dynamic settings.
7. Run `npm run test` and `npm run lint` before release.
