import { del, get, set } from 'idb-keyval';
import { SecretReference, SecretStore } from '@/integrations/security/types.ts';
import { integrationSecretsStore } from '@/integrations/storage/indexeddb.ts';

const getSecretKey = (ref: SecretReference) => `${ref.providerId}:${ref.key}`;

const encode = (value: string) => btoa(unescape(encodeURIComponent(value)));
const decode = (value: string) => decodeURIComponent(escape(atob(value)));

export class IndexedDbSecretStore implements SecretStore {
  async set(ref: SecretReference, value: string) {
    await set(getSecretKey(ref), encode(value), integrationSecretsStore);
  }

  async get(ref: SecretReference) {
    const value = await get<string>(getSecretKey(ref), integrationSecretsStore);
    if (!value) return undefined;
    return decode(value);
  }

  async remove(ref: SecretReference) {
    await del(getSecretKey(ref), integrationSecretsStore);
  }
}
