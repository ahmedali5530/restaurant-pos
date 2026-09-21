import { invoke } from '@tauri-apps/api/core';

export type DesktopStatus = {
  isDesktop: boolean;
  needsSetup: boolean;
  surrealReady: boolean;
  gatewayReady: boolean;
  setupComplete: boolean;
  appData: string;
};

export type ImportSurqlResult = {
  ok: boolean;
  imported: string[];
  error?: string | null;
};

export function isTauriDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function getDesktopStatus(): Promise<DesktopStatus | null> {
  if (!isTauriDesktop()) return null;
  return invoke<DesktopStatus>('desktop_status');
}

export async function pickSurqlFiles(): Promise<string[]> {
  if (!isTauriDesktop()) return [];
  return invoke<string[]>('pick_surql_files');
}

export async function importSurqlFiles(paths: string[]): Promise<ImportSurqlResult> {
  return invoke<ImportSurqlResult>('import_surql', { paths });
}

export async function markDesktopSetupComplete(): Promise<void> {
  await invoke('mark_setup_complete');
}

export async function openMigrationsFolder(): Promise<string> {
  return invoke<string>('open_migrations_folder');
}
