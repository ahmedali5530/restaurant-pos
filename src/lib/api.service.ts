export const API_SERVER_URL =
  (import.meta.env.VITE_API_SERVER_URL as string) || "http://localhost:3140";

export const apiUrl = (path: string): string =>
  `${API_SERVER_URL.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
