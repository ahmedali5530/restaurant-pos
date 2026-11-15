import {authHeaders, getGatewayBaseUrl} from "@/lib/session.ts";

export class BackupHttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "BackupHttpError";
    this.status = status;
  }
}

function backupBaseUrl(): string {
  return `${getGatewayBaseUrl()}/backup`;
}

/** Download full-database `.surql` export from the gateway. */
export async function downloadDatabaseBackup(): Promise<void> {
  const headers = authHeaders();
  headers.delete("Content-Type");

  const res = await fetch(`${backupBaseUrl()}/database`, {
    method: "GET",
    headers,
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) message = String(body.error);
    } catch {
      // ignore non-JSON error bodies
    }
    throw new BackupHttpError(res.status, message);
  }

  const blob = await res.blob();
  const disposition = res.headers.get("content-disposition") || "";
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  const filename = match?.[1] || `posr-database-${new Date().toISOString().replace(/[:.]/g, "-")}.surql`;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Upload a `.surql` file to the gateway for import. */
export async function uploadDatabaseBackup(file: File): Promise<void> {
  const headers = authHeaders();
  headers.set("Content-Type", "application/octet-stream");
  headers.set("X-Backup-Filename", file.name || "restore.surql");

  const res = await fetch(`${backupBaseUrl()}/database`, {
    method: "POST",
    headers,
    body: file,
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) message = String(body.error);
    } catch {
      // ignore
    }
    throw new BackupHttpError(res.status, message);
  }
}
