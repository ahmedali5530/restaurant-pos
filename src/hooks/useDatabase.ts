import { useContext } from "react";
import {DatabaseContext} from "@/providers/database.provider.tsx";

/**
 * Access the Surreal connection state from the context.
 */
export const useDatabase = () => {
  const context = useContext(DatabaseContext);
  if (!context) {
    throw new Error("useDatabase must be used within a DatabaseProvider");
  }
  return context;
};

/**
 * Access the Surreal client from the context.
 */
export const useDatabaseClient = () => {
  const { client } = useDatabase();
  return client;
};