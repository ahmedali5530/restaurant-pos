export type SecretAuthType = 'apiKey' | 'oauth' | 'jwt' | 'certificate' | 'mtls' | 'none';

export interface SecretReference {
  providerId: string;
  key: string;
}

export interface SecretStore {
  set(ref: SecretReference, value: string): Promise<void>;
  get(ref: SecretReference): Promise<string | undefined>;
  remove(ref: SecretReference): Promise<void>;
}
