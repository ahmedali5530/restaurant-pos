import {useEffect, useRef, useState} from "react";
import {useDB} from "@/api/db/db.ts";
import type {User} from "@/api/model/user.ts";
import {fetchUserModules, getUserModules} from "@/lib/access.rules.ts";

/**
 * Permission modules for the signed-in user. Re-fetches user_role from Surreal
 * (same as protectAction) so AI tools match Manage UI — the Jotai login snapshot
 * often lacks user_role.roles even when the DB role is fully assigned.
 */
export const useAllowedModules = (user?: User): string[] => {
  const db = useDB();
  const queryRef = useRef(db.query);
  queryRef.current = db.query;
  const userRef = useRef(user);
  userRef.current = user;

  const [modules, setModules] = useState<string[]>(() => getUserModules(user));
  const userId = user?.id;

  useEffect(() => {
    const currentUser = userRef.current;
    if (!userId || !currentUser) {
      setModules([]);
      return;
    }

    let cancelled = false;

    void (async () => {
      const stableDb = {
        query: (sql: string, params?: unknown) => queryRef.current(sql, params),
      };
      const fetched = await fetchUserModules(stableDb, currentUser);
      if (!cancelled) {
        setModules(fetched);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return modules;
};
