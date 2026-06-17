import React, { ReactNode, useEffect, useRef } from "react";
import { useAtom, useSetAtom } from "jotai";
import { toast } from "sonner";
import { useDB } from "@/api/db/db.ts";
import { appPage, closingEnforcementAtom, defaultClosingEnforcementState } from "@/store/jotai.ts";
import { getClosingEnforcementState } from "@/lib/closing.guard.ts";
import { CLOSING } from "@/routes/posr.ts";
import {useTranslation} from "react-i18next";

const CHECK_INTERVAL_MS = 30_000;
export const CYCLE_ENDED_TOAST_ID = "closing-cycle-ended";

interface ClosingCycleEnforcementProviderProps {
  children: ReactNode;
}

export const ClosingCycleEnforcementProvider: React.FC<ClosingCycleEnforcementProviderProps> = ({
  children,
}) => {
  const {t} = useTranslation("closing");
  const db = useDB();
  const [page] = useAtom(appPage);
  const setEnforcement = useSetAtom(closingEnforcementAtom);
  const dbRef = useRef(db);
  const pageRef = useRef(page);


  dbRef.current = db;
  pageRef.current = page;

  const dismissCycleEndedToast = () => {
    toast.dismiss(CYCLE_ENDED_TOAST_ID);
  };

  useEffect(() => {
    let isActive = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (!isActive) {
        return;
      }

      const userId = pageRef.current?.user?.id?.toString();
      if (!userId) {
        setEnforcement(defaultClosingEnforcementState);
        dismissCycleEndedToast();
        return;
      }

      try {
        const state = await getClosingEnforcementState(dbRef.current);
        if (!isActive) {
          return;
        }

        setEnforcement(state);

        const showCycleEndedWarning =
          state.cycleEndedAt !== null &&
          !state.dayClosingCompleted &&
          state.message !== null;

        if (showCycleEndedWarning) {
          toast.warning(state.message!, {
            id: CYCLE_ENDED_TOAST_ID,
            duration: Infinity,
            action: {
              label: t("actions.goToClosing"),
              onClick: () => {
                window.location.href = CLOSING;
              },
            },
          });
        } else {
          dismissCycleEndedToast();
        }
      } catch (error) {
        console.error("Closing cycle enforcement tick failed:", error);
      }
    };

    const runLoop = async () => {
      if (!isActive) {
        return;
      }

      await tick();

      if (!isActive) {
        return;
      }

      timeoutId = setTimeout(() => {
        void runLoop();
      }, CHECK_INTERVAL_MS);
    };

    void runLoop();

    return () => {
      isActive = false;
      dismissCycleEndedToast();
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [page?.user?.id, setEnforcement]);

  return <>{children}</>;
};
