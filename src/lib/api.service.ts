import { runtimeApiServerUrl } from "@/lib/runtime-config.ts";

export const API_SERVER_URL =
  (import.meta.env.VITE_API_SERVER_URL as string) || "http://localhost:3140";

export function apiServerUrl(): string {
  return (runtimeApiServerUrl() || API_SERVER_URL).replace(/\/$/, "");
}

export const apiUrl = (path: string): string =>
  `${apiServerUrl()}${path.startsWith("/") ? path : `/${path}`}`;
