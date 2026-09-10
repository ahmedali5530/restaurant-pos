import { indexedDB as fakeIDB, IDBKeyRange as fakeKeyRange } from 'fake-indexeddb';

const targets = [
  globalThis,
  typeof window !== 'undefined' ? window : null,
  typeof self !== 'undefined' ? self : null,
  typeof global !== 'undefined' ? global : null,
];

for (const target of targets) {
  if (!target) continue;
  Object.defineProperty(target, 'indexedDB', {
    value: fakeIDB,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(target, 'IDBKeyRange', {
    value: fakeKeyRange,
    configurable: true,
    writable: true,
  });
}
