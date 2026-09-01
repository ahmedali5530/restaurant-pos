import React, { createContext, useEffect, useMemo, useCallback, useState, useRef, ReactNode } from "react";
import { Surreal } from "surrealdb";
import {
  DB_REST_API,
  DB_REST_DB,
  DB_REST_NS,
  isGatewayAuthEnabled,
  resolveDbAuthentication,
  resolveDbWebsocketUrl,
  withApi,
} from "@/api/db/settings.ts";
import {
  getSessionToken,
  getSurrealToken,
  invalidateGatewaySession,
  isJwtExpiredOrNearExpiry,
  isSurrealAuthError,
  refreshSurrealToken,
} from "@/lib/session.ts";
import { PageLoader } from "@/components/common/loader/page-loader.tsx";
import { useTranslation } from "react-i18next";

const SESSION_EVENT = "posr-session";

const dbEndpointLabel = () => {
  const endpoint = withApi("") || DB_REST_API || "(missing VITE_DB_WEBDOCKET)";
  if (typeof endpoint === "string" && /localhost|127\.0\.0\.1/.test(endpoint)) {
    return `${endpoint} — note: localhost only works on the host running Surreal/gateway`;
  }
  return String(endpoint);
};

export interface DatabaseProviderState {
  /** The Surreal instance */
  client: Surreal;
  /** Whether the connection is pending */
  isConnecting: boolean;
  /** Whether the connection was successfully established */
  isConnected: boolean;
  /** Whether the connection rejected in an error */
  isError: boolean;
  /** The connection error, if present */
  error: unknown;
  /** Connect to the Surreal instance */
  connect: () => Promise<void>;
  /** Close the Surreal instance */
  close: () => Promise<void>;
}

export const DatabaseContext = createContext<DatabaseProviderState | undefined>(undefined);

export interface DatabaseProviderProps {
  children: ReactNode;
  /** Auto connect on component mount, defaults to true */
  autoConnect?: boolean;
}

export const DatabaseProvider: React.FC<DatabaseProviderProps> = ({
  children,
  autoConnect = true,
}) => {
  const { t } = useTranslation("common");
  const [surrealInstance] = useState(() => new Surreal());
  const gatewayMode = isGatewayAuthEnabled();
  const [sessionReady, setSessionReady] = useState(() => !gatewayMode || Boolean(getSessionToken()));
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const connectInFlight = useRef<Promise<void> | null>(null);
  const wasSessionReady = useRef(sessionReady);
  const hasConnectedOnce = useRef(false);

  useEffect(() => {
    if (!gatewayMode) {
      setSessionReady(true);
      return;
    }
    const sync = () => setSessionReady(Boolean(getSessionToken()));
    sync();
    window.addEventListener(SESSION_EVENT, sync);
    return () => window.removeEventListener(SESSION_EVENT, sync);
  }, [gatewayMode]);

  const connect = useCallback(async (options?: { silent?: boolean }) => {
    if (connectInFlight.current) {
      return connectInFlight.current;
    }

    // Trust the live socket, not React state (StrictMode can desync them).
    if (surrealInstance.isConnected) {
      setIsConnected(true);
      setIsError(false);
      setError(null);
      return;
    }

    const initialAttempt = !hasConnectedOnce.current;
    const silent = options?.silent ?? false;

    const pending = (async () => {
      if (initialAttempt && !silent) {
        setIsConnecting(true);
      }
      if (initialAttempt) {
        setIsError(false);
        setError(null);
      }

      const openSocket = async () => {
        const endpoint = resolveDbWebsocketUrl();
        const authentication = resolveDbAuthentication();

        if (gatewayMode && !getSessionToken()) {
          throw new Error("No POS session — login required");
        }
        if (gatewayMode && !authentication) {
          throw new Error("No database token — login required");
        }

        // Ensure a clean socket before reconnect (expired-token retries).
        if (surrealInstance.isConnected) {
          try {
            await surrealInstance.close();
          } catch {
            // ignore
          }
        }

        await surrealInstance.connect(endpoint || withApi(""), {
          namespace: DB_REST_NS,
          database: DB_REST_DB,
          ...(authentication ? { authentication } : {}),
        });

        if (!surrealInstance.isConnected) {
          throw new Error("SurrealDB connect finished without an active connection");
        }
      };

      try {
        console.log("Connecting to SurrealDB...");

        if (gatewayMode && isJwtExpiredOrNearExpiry(getSurrealToken())) {
          const refreshed = await refreshSurrealToken();
          if (!refreshed) {
            invalidateGatewaySession();
            throw new Error("Database session expired — please log in again");
          }
        }

        try {
          await openSocket();
        } catch (err) {
          if (!gatewayMode || !isSurrealAuthError(err)) {
            throw err;
          }

          console.warn("Surreal auth failed; refreshing database token...", err);
          const refreshed = await refreshSurrealToken();
          if (!refreshed) {
            invalidateGatewaySession();
            throw new Error("Database session expired — please log in again");
          }

          try {
            await surrealInstance.close();
          } catch {
            // ignore
          }
          await openSocket();
        }

        console.log("Successfully connected to SurrealDB");
        setIsConnected(true);
        hasConnectedOnce.current = true;
      } catch (err) {
        setIsConnected(false);
        if (initialAttempt) {
          setIsError(true);
          setError(err);
        }
        throw err;
      } finally {
        if (initialAttempt) {
          setIsConnecting(false);
        }
      }
    })();

    connectInFlight.current = pending;
    try {
      await pending;
    } finally {
      if (connectInFlight.current === pending) {
        connectInFlight.current = null;
      }
    }
  }, [gatewayMode, surrealInstance]);

  const close = useCallback(async () => {
    connectInFlight.current = null;
    try {
      await surrealInstance.close();
    } catch {
      // ignore
    }
    setIsConnected(false);
    setIsConnecting(false);
    setIsError(false);
    setError(null);
    hasConnectedOnce.current = false;
  }, [surrealInstance]);

  // Auto-connect when session allows it.
  // IMPORTANT: do not close the socket in this effect's cleanup — React StrictMode
  // runs cleanup immediately in production too and would kill a healthy connection
  // while React state still says isConnected=true.
  useEffect(() => {
    if (!autoConnect) {
      return;
    }
    if (gatewayMode && !sessionReady) {
      return;
    }
    void connect().catch(() => {
      // surfaced via isError
    });
  }, [autoConnect, gatewayMode, sessionReady, connect]);

  // Logout: session cleared after it was ready.
  useEffect(() => {
    if (gatewayMode && wasSessionReady.current && !sessionReady) {
      void close().catch(() => {});
    }
    wasSessionReady.current = sessionReady;
  }, [gatewayMode, sessionReady, close]);

  // Keep React flags aligned with the real socket (handles StrictMode / drops).
  useEffect(() => {
    const id = window.setInterval(() => {
      const live = surrealInstance.isConnected;
      setIsConnected((prev) => (prev === live ? prev : live));
      if (!live && getSessionToken() && !connectInFlight.current) {
        void connect({ silent: true }).catch(() => {});
      }
    }, 2000);
    return () => window.clearInterval(id);
  }, [surrealInstance, connect]);

  const value: DatabaseProviderState = useMemo(
    () => ({
      client: surrealInstance,
      isConnecting,
      isConnected,
      isError,
      error,
      connect,
      close,
    }),
    [surrealInstance, isConnecting, isConnected, isError, error, connect, close],
  );

  useEffect(() => {
    const onReconnect = () => {
      void connect({ silent: hasConnectedOnce.current }).catch(() => {});
    };
    window.addEventListener('posr-db-reconnect', onReconnect);
    return () => window.removeEventListener('posr-db-reconnect', onReconnect);
  }, [connect]);

  useEffect(() => {
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const errorName = event?.reason?.name;
      if (errorName === "ConnectionUnavailable" || errorName === "EngineDisconnected") {
        setIsConnected(false);
      }
    };

    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  // Pre-login / mid-login: show Login without waiting for Surreal.
  // - No token: true pre-login keypad
  // - Token set but session not announced yet: Login stays mounted for connect +
  //   clock-in check (Login shows its own PageLoader via isAuthenticating)
  // Once both token and sessionReady are set, fall through to PageLoader until connected.
  if (gatewayMode && (!getSessionToken() || !sessionReady)) {
    return (
      <DatabaseContext.Provider value={value}>
        {children}
      </DatabaseContext.Provider>
    );
  }

  if (!hasConnectedOnce.current && isError && !isConnected) {
    return (
      <DatabaseContext.Provider value={value}>
        <div className="flex items-center justify-center min-h-screen bg-gray-100">
          <div className="text-center max-w-md p-6 bg-danger-50 border border-danger-200 rounded-lg">
            <h2 className="text-xl font-semibold text-danger-800 mb-2">{t("database.connectionError")}</h2>
            <p className="text-danger-600 mb-2">{String(error) || t("database.connectionFailed")}</p>
            <p className="text-xs text-neutral-600 mb-4 break-all font-mono">{dbEndpointLabel()}</p>
            <button
              onClick={() => {
                void connect();
              }}
              className="px-4 py-2 bg-danger-600 text-white rounded hover:bg-danger-700"
            >
              {t("database.retryConnection")}
            </button>
          </div>
        </div>
      </DatabaseContext.Provider>
    );
  }

  if (!hasConnectedOnce.current && (isConnecting || !isConnected)) {
    console.log(`connecting to ${dbEndpointLabel()}...`);
    return (
      <DatabaseContext.Provider value={value}>
        <PageLoader message={`${t("database.connecting")}`} />
      </DatabaseContext.Provider>
    );
  }

  return (
    <DatabaseContext.Provider value={value}>
      {children}
    </DatabaseContext.Provider>
  );
};
