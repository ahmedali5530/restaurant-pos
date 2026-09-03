/**
 * Lock screen — shown when the POS session is locked (via the sidebar lock
 * button or SessionIdleProvider timeout).
 *
 * SECURITY FIX (a11y + correctness):
 *   - Previously this component hard-coded the name 'Kashif' and showed no way
 *     to unlock. Now it reads the locked user's identity from the appPage atom
 *     and provides a PIN entry form that re-authenticates the user via the
 *     gateway's /auth/login endpoint.
 *   - The PIN pad is keyboard-accessible: each digit button has aria-label,
 *     and the Enter/Backspace keys are handled for physical keyboards.
 *
 * Flow:
 *   1. User clicks lock (sidebar) or session times out → lockSession() sets
 *      page.lock = true and records the current user.
 *   2. Lock screen renders with the user's name + PIN pad.
 *   3. User enters PIN (4 digits) → form auto-submits.
 *   4. On success: unlockSession() clears page.lock → app returns to normal.
 *   5. On failure: clear PIN + show error; rate limiter on the gateway
 *      handles brute-force (5 attempts → 15 min lockout).
 */

import { useState, useEffect, useCallback } from "react";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { appPage } from "@/store/jotai.ts";
import { getGatewayBaseUrl, authHeaders } from "@/lib/session.ts";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDeleteLeft } from "@fortawesome/free-solid-svg-icons";

const PIN_LENGTH = 4;

export const Lock = () => {
  const { t } = useTranslation(["common", "auth", "toast"]);
  const [page, setPage] = useAtom(appPage);
  const navigate = useNavigate();
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lockedUser: any = page.user;
  const lockedUserName = lockedUser?.first_name || lockedUser?.login || t("common:lock.unknownUser", { defaultValue: "User" });
  const lockedUserLogin = lockedUser?.login;

  const submitPin = useCallback(async (pinValue: string) => {
    if (pinValue.length !== PIN_LENGTH) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${getGatewayBaseUrl()}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "pin", login: lockedUserLogin, password: pinValue }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        // Rate limiter may have kicked in — surface the error.
        const msg = data.error || t("toast:auth.invalidCredentials", { defaultValue: "Invalid credentials" });
        if (res.status === 429) {
          setError(t("toast:auth.tooManyAttempts", { defaultValue: "Too many attempts. Try again later." }));
        } else {
          setError(msg);
        }
        setPin("");
        return;
      }
      // Success — update the session tokens (gateway returned new JWT + surrealToken).
      if (data.token) {
        localStorage.setItem("posr_session_token", data.token);
      }
      if (data.surrealToken) {
        localStorage.setItem("posr_surreal_token", data.surrealToken);
      }
      // Unlock the session.
      setPage((prev: any) => ({ ...prev, lock: false }));
      toast.success(t("toast:auth.unlocked", { defaultValue: "Session unlocked" }));
    } catch (err: any) {
      setError(err?.message || t("toast:auth.unlockFailed", { defaultValue: "Failed to unlock" }));
      setPin("");
    } finally {
      setSubmitting(false);
    }
  }, [lockedUserLogin, setPage, t]);

  // Handle physical keyboard input.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (submitting) return;
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        setPin((prev) => (prev.length < PIN_LENGTH ? prev + e.key : prev));
      } else if (e.key === "Backspace") {
        e.preventDefault();
        setPin((prev) => prev.slice(0, -1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (pin.length === PIN_LENGTH) {
          submitPin(pin);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [pin, submitting, submitPin]);

  // Auto-submit when PIN is complete.
  useEffect(() => {
    if (pin.length === PIN_LENGTH && !submitting) {
      submitPin(pin);
    }
  }, [pin, submitting, submitPin]);

  const handleDigit = (digit: string) => {
    if (submitting) return;
    setPin((prev) => (prev.length < PIN_LENGTH ? prev + digit : prev));
  };

  const handleBackspace = () => {
    if (submitting) return;
    setPin((prev) => prev.slice(0, -1));
  };

  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen bg-neutral-900 text-white p-4"
      data-testid="lock-screen"
    >
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold mb-2">
          {t("common:lock.lockedTitle", { defaultValue: "Session Locked" })}
        </h1>
        <p className="text-neutral-400">
          {t("common:lock.lockedBy", { name: lockedUserName, defaultValue: "Locked by {{name}}" })}
        </p>
        <p className="text-sm text-neutral-500 mt-1">
          {t("common:lock.enterPinToUnlock", { defaultValue: "Enter your PIN to unlock" })}
        </p>
      </div>

      {/* PIN dots */}
      <div className="flex gap-3 mb-6" data-testid="lock-pin-dots">
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full border-2 border-neutral-500 ${
              i < pin.length ? "bg-white border-white" : ""
            }`}
          />
        ))}
      </div>

      {/* Error message */}
      {error && (
        <div className="text-red-400 text-sm mb-4" data-testid="lock-error" role="alert">
          {error}
        </div>
      )}

      {/* PIN pad */}
      <div className="grid grid-cols-3 gap-3 max-w-xs" data-testid="lock-pinpad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
          <button
            key={digit}
            type="button"
            onClick={() => handleDigit(digit)}
            disabled={submitting}
            aria-label={t("common:lock.digit", { defaultValue: "Digit {{d}}", d: digit })}
            className="w-20 h-20 rounded-xl bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 text-2xl font-semibold transition-colors disabled:opacity-50"
            data-testid={`lock-pinpad-${digit}`}
          >
            {digit}
          </button>
        ))}
        <div /> {/* spacer */}
        <button
          type="button"
          onClick={() => pin.length === PIN_LENGTH && submitPin(pin)}
          disabled={submitting || pin.length !== PIN_LENGTH}
          aria-label={t("common:lock.unlock", { defaultValue: "Unlock" })}
          className="w-20 h-20 rounded-xl bg-green-600 hover:bg-green-500 active:bg-green-700 text-white text-sm font-semibold transition-colors disabled:opacity-30"
          data-testid="lock-pinpad-enter"
        >
          {submitting ? "…" : t("common:lock.unlock", { defaultValue: "Unlock" })}
        </button>
        <button
          type="button"
          onClick={handleBackspace}
          disabled={submitting || pin.length === 0}
          aria-label={t("common:lock.backspace", { defaultValue: "Backspace" })}
          className="w-20 h-20 rounded-xl bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 text-white text-xl transition-colors disabled:opacity-30"
          data-testid="lock-pinpad-backspace"
        >
          <FontAwesomeIcon icon={faDeleteLeft} />
        </button>
      </div>

      {/* Logout option */}
      <button
        type="button"
        onClick={() => {
          // Navigate to login — the user can log in as a different user.
          setPage((prev: any) => ({ ...prev, lock: false, user: null, page: "Login" }));
          navigate("/");
        }}
        className="mt-8 text-sm text-neutral-500 hover:text-neutral-300 underline"
        data-testid="lock-switch-user"
      >
        {t("common:lock.switchUser", { defaultValue: "Switch user" })}
      </button>
    </div>
  );
};
