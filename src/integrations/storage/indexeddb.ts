import { createStore } from 'idb-keyval';

// Use dedicated database names. The shared `posr-react` DB was already created
// with only the `jotai-storage` object store; adding new stores to it requires
// a version bump that idb-keyval does not perform on existing databases.
export const integrationQueueStore = createStore('posr-react-integration-queue', 'keyval');
export const integrationSecretsStore = createStore('posr-react-integration-secrets', 'keyval');
