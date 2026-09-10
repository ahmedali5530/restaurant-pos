export { PosStoreDatabase, getPosStoreDatabase, resetPosStoreDatabaseForTests, POS_STORE_DB_NAME } from './db.ts';
export { PosStore, posStore } from './pos-store.ts';
export {
  OWNER_HEARTBEAT_STALE_MS,
  POS_SCHEMA_VERSION,
  POS_SYNC_PROTOCOL_VERSION,
  PosStoreError,
} from './types.ts';
export type {
  CreateOrderInput,
  CreateOrderItemInput,
  DomainOperation,
  OrderRecord,
  OrderItemRecord,
  SyncPhase,
  TerminalIdentity,
} from './types.ts';
export {
  assertCashierOwner,
  canStealOrder,
  isKitchenStageOperation,
  isOwnerHeartbeatStale,
} from './ownership.ts';
export {
  isPosStoreEffectivelyConnected,
  resetPosStoreConnectivityForTests,
  setPosStoreEffectivelyConnected,
} from './connectivity.ts';
