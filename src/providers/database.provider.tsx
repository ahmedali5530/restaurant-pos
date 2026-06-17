import React, { createContext, useContext, useEffect, useMemo, useCallback, useState, ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { Surreal } from "surrealdb";
import { DB_REST_DB, DB_REST_NS, DB_REST_PASS, DB_REST_USER, withApi } from "@/api/db/settings.ts";
import { useTranslation } from "react-i18next";

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
  autoConnect = true 
}) => {
  const { t } = useTranslation('common');
  // Surreal instance remains stable across re-renders (created once)
  const [surrealInstance] = useState(() => new Surreal());

  // React Query mutation for connecting to Surreal
  const {
    mutateAsync: connectMutation,
    isPending,
    isSuccess,
    isError,
    error,
    reset,
  } = useMutation({
    mutationFn: async () => {
      console.log('Connecting to SurrealDB...');
      await surrealInstance.connect(withApi(''), {
        namespace: DB_REST_NS,
        database: DB_REST_DB,
        authentication: {
          username: DB_REST_USER,
          password: DB_REST_PASS,
        }
      });
      // Wait for connection to be ready
      await surrealInstance.ready;
      console.log('Successfully connected to SurrealDB');
    },
  });

  // Wrap mutateAsync in a stable callback
  const connect = useCallback(async () => {
    await connectMutation();
  }, [connectMutation]);

  // Wrap close() in a stable callback
  const close = useCallback(async () => {
    await surrealInstance.close();
    reset();
  }, [surrealInstance, reset]);

  // Auto-connect on mount (if enabled) and cleanup on unmount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      reset();
      surrealInstance.close();
    };
  }, [autoConnect, connect, reset, surrealInstance]);

  // Memoize the context value
  const value: DatabaseProviderState = useMemo(
    () => ({
      client: surrealInstance,
      isConnecting: isPending,
      isConnected: isSuccess,
      isError,
      error,
      connect,
      close,
    }),
    [surrealInstance, isPending, isSuccess, isError, error, connect, close],
  );

  useEffect(() => {
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const errorName = event?.reason?.name;
      if (errorName === "ConnectionUnavailable" || errorName === "EngineDisconnected") {
        // Intentionally left as a no-op; UI presents reconnect controls.
      }
    };

    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  if (isError) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-center max-w-md p-6 bg-danger-50 border border-danger-200 rounded-lg">
          <h2 className="text-xl font-semibold text-danger-800 mb-2">{t('database.connectionError')}</h2>
          <p className="text-danger-600 mb-4">{String(error) || t('database.connectionFailed')}</p>
          <button
            onClick={() => connect()}
            className="px-4 py-2 bg-danger-600 text-white rounded hover:bg-danger-700"
          >
            {t('database.retryConnection')}
          </button>
        </div>
      </div>
    );
  }

  // Show loading state while connecting
  if (isPending || !isSuccess) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">{t('database.connecting')}</p>
        </div>
      </div>
    );
  }

  // Only render children when connection is successful
  return (
    <DatabaseContext.Provider value={value}>
      {children}
    </DatabaseContext.Provider>
  );
};

