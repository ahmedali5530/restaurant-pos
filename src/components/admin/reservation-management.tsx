/**
 * Reservations & Waitlist screen — admin panel for managing table bookings
 * and walk-in waitlist.
 *
 * Research finding: OpenTable charges $300+/mo, Toast Waitlist $50/mo.
 * POSR offers it free.
 *
 * Two panels:
 *   1. Reservations — calendar view for today's reservations
 *      (create + confirm + seat + cancel + no-show)
 *   2. Waitlist — live walk-in queue
 *      (add + call + seat + mark left)
 *
 * Placement: new tab in Admin screen (20th tab, after 'marketing')
 */

import { useState, useEffect, useCallback } from "react";
import { useDB } from "@/api/db/db.ts";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/common/input/button.tsx";
import { InputField } from "@/components/common/form/rhf-fields.tsx";
import { Textarea } from "@/components/common/input/textarea.tsx";
import {
  createReservation,
  confirmReservation,
  seatReservation,
  cancelReservation,
  markNoShow,
  completeReservation,
  getReservationsByDate,
  addToWaitlist,
  callFromWaitlist,
  seatFromWaitlist,
  markLeftWaitlist,
  getCurrentWaitlist,
  type Reservation,
  type WaitlistEntry,
  type ReservationStatus,
  type WaitlistStatus,
} from "@/lib/reservation.service.ts";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-blue-100 text-blue-800",
  seated: "bg-green-100 text-green-800",
  completed: "bg-neutral-100 text-neutral-600",
  cancelled: "bg-red-100 text-red-800",
  no_show: "bg-red-100 text-red-800",
  waiting: "bg-yellow-100 text-yellow-800",
  called: "bg-blue-100 text-blue-800",
  left: "bg-neutral-100 text-neutral-500",
};

export function ReservationManagement() {
  const { t } = useTranslation(["admin", "common"]);
  const db = useDB();
  const [activeTab, setActiveTab] = useState<"reservations" | "waitlist">("reservations");

  return (
    <div className="p-4" data-testid="reservation-management">
      {/* Tab switcher */}
      <div className="flex gap-2 mb-4">
        <Button
          variant={activeTab === "reservations" ? "primary" : "ghost"}
          onClick={() => setActiveTab("reservations")}
        >
          {t("admin:reservations.tab", { defaultValue: "Reservations" })}
        </Button>
        <Button
          variant={activeTab === "waitlist" ? "primary" : "ghost"}
          onClick={() => setActiveTab("waitlist")}
        >
          {t("admin:reservations.waitlistTab", { defaultValue: "Waitlist" })}
        </Button>
      </div>

      {activeTab === "reservations" ? (
        <ReservationsPanel db={db} t={t} />
      ) : (
        <WaitlistPanel db={db} t={t} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reservations panel
// ---------------------------------------------------------------------------

function ReservationsPanel({ db, t }: { db: any; t: any }) {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // New reservation form
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [partySize, setPartySize] = useState(2);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 16));
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const result = await getReservationsByDate(db, today);
      setReservations(result);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => { void load(); }, [load]);

  const handleCreate = useCallback(async () => {
    if (!name.trim() || partySize < 1) return;
    try {
      await createReservation(db, {
        customer_name: name,
        customer_phone: phone || undefined,
        party_size: partySize,
        date: new Date(date).toISOString(),
        notes: notes || undefined,
      });
      toast.success(t("admin:reservations.created", { defaultValue: "Reservation created" }));
      setName(""); setPhone(""); setPartySize(2); setNotes("");
      setShowCreate(false);
      void load();
    } catch (err: any) {
      toast.error(err?.message || "Failed to create reservation");
    }
  }, [db, name, phone, partySize, date, notes, t, load]);

  const handleAction = useCallback(async (action: string, reservationId: string) => {
    try {
      switch (action) {
        case "confirm": await confirmReservation(db, reservationId); break;
        case "seat": await seatReservation(db, reservationId, ""); break;
        case "complete": await completeReservation(db, reservationId); break;
        case "cancel": await cancelReservation(db, reservationId); break;
        case "noshow": await markNoShow(db, reservationId); break;
      }
      toast.success(t("admin:reservations.updated", { defaultValue: "Reservation updated" }));
      void load();
    } catch (err: any) {
      toast.error(err?.message || "Action failed");
    }
  }, [db, t, load]);

  if (loading) {
    return <div className="text-center py-10 text-neutral-400">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Create button */}
      <div className="flex justify-between">
        <h3 className="text-lg font-semibold">
          {t("admin:reservations.todaysReservations", { defaultValue: "Today's Reservations" })}
          <span className="ml-2 text-sm text-neutral-500">({reservations.length})</span>
        </h3>
        <Button variant="primary" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? "Cancel" : t("admin:reservations.newReservation", { defaultValue: "+ New Reservation" })}
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-white border rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <InputField name="resName" label="Customer name" control={{ value: name, onChange: (v: any) => setName(String(v || "")) } as any} />
            <InputField name="resPhone" label="Phone" control={{ value: phone, onChange: (v: any) => setPhone(String(v || "")) } as any} />
            <InputField name="resParty" label="Party size" type="number" control={{ value: partySize, onChange: (v: any) => setPartySize(Number(v) || 1) } as any} />
            <InputField name="resDate" label="Date & time" type="datetime-local" control={{ value: date, onChange: (v: any) => setDate(String(v || "")) } as any} />
          </div>
          <Textarea value={notes} onChange={(e: any) => setNotes(e?.target?.value ?? "")} rows={2} placeholder="Notes (optional)" />
          <Button variant="primary" onClick={() => void handleCreate()}>Create</Button>
        </div>
      )}

      {/* Reservation list */}
      {reservations.length === 0 ? (
        <div className="text-center py-10 text-neutral-400">
          {t("admin:reservations.empty", { defaultValue: "No reservations for today" })}
        </div>
      ) : (
        <div className="space-y-2">
          {reservations.map((res) => (
            <div key={res.id} className="bg-white border rounded-xl p-3 flex items-center gap-3" data-testid={`reservation-${res.id}`}>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{res.customer_name}</span>
                  <span className="text-sm text-neutral-500">×{res.party_size}</span>
                  <span className="text-sm text-neutral-400">
                    {new Date(res.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                {res.customer_phone && <div className="text-xs text-neutral-500">{res.customer_phone}</div>}
                {res.notes && <div className="text-xs text-neutral-400 mt-1">{res.notes}</div>}
              </div>
              <span className={`px-2 py-1 rounded text-xs font-semibold ${STATUS_COLORS[res.status] || ""}`}>
                {res.status}
              </span>
              {/* Action buttons */}
              <div className="flex gap-1">
                {res.status === "pending" && (
                  <Button variant="ghost" size="sm" onClick={() => void handleAction("confirm", res.id)}>Confirm</Button>
                )}
                {res.status === "confirmed" && (
                  <Button variant="primary" size="sm" onClick={() => void handleAction("seat", res.id)}>Seat</Button>
                )}
                {res.status === "seated" && (
                  <Button variant="ghost" size="sm" onClick={() => void handleAction("complete", res.id)}>Done</Button>
                )}
                {["pending", "confirmed"].includes(res.status) && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => void handleAction("noshow", res.id)}>No-show</Button>
                    <Button variant="ghost" size="sm" onClick={() => void handleAction("cancel", res.id)}>Cancel</Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Waitlist panel
// ---------------------------------------------------------------------------

function WaitlistPanel({ db, t }: { db: any; t: any }) {
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [partySize, setPartySize] = useState(2);
  const [quotedWait, setQuotedWait] = useState(15);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getCurrentWaitlist(db);
      setWaitlist(result);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => { void load(); }, [load]);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(() => void load(), 30000);
    return () => clearInterval(interval);
  }, [load]);

  const handleAdd = useCallback(async () => {
    if (!name.trim()) return;
    try {
      await addToWaitlist(db, {
        customer_name: name,
        customer_phone: phone || undefined,
        party_size: partySize,
        quoted_wait_minutes: quotedWait,
      });
      toast.success(t("admin:reservations.addedToWaitlist", { defaultValue: "Added to waitlist" }));
      setName(""); setPhone(""); setPartySize(2); setQuotedWait(15);
      void load();
    } catch (err: any) {
      toast.error(err?.message || "Failed to add to waitlist");
    }
  }, [db, name, phone, partySize, quotedWait, t, load]);

  const handleAction = useCallback(async (action: string, entryId: string) => {
    try {
      switch (action) {
        case "call": await callFromWaitlist(db, entryId); break;
        case "seat": await seatFromWaitlist(db, entryId, ""); break;
        case "left": await markLeftWaitlist(db, entryId); break;
      }
      void load();
    } catch (err: any) {
      toast.error(err?.message || "Action failed");
    }
  }, [db, load]);

  if (loading) {
    return <div className="text-center py-10 text-neutral-400">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Add to waitlist form */}
      <div className="bg-white border rounded-xl p-4 space-y-3">
        <h3 className="font-semibold">{t("admin:reservations.addWalkIn", { defaultValue: "Add Walk-In" })}</h3>
        <div className="grid grid-cols-4 gap-3">
          <InputField name="wlName" label="Name" control={{ value: name, onChange: (v: any) => setName(String(v || "")) } as any} />
          <InputField name="wlPhone" label="Phone" control={{ value: phone, onChange: (v: any) => setPhone(String(v || "")) } as any} />
          <InputField name="wlParty" label="Party" type="number" control={{ value: partySize, onChange: (v: any) => setPartySize(Number(v) || 1) } as any} />
          <InputField name="wlWait" label="Quoted wait (min)" type="number" control={{ value: quotedWait, onChange: (v: any) => setQuotedWait(Number(v) || 15) } as any} />
        </div>
        <Button variant="primary" onClick={() => void handleAdd()}>
          {t("admin:reservations.addToWaitlist", { defaultValue: "Add to Waitlist" })}
        </Button>
      </div>

      {/* Waitlist */}
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">
          {t("admin:reservations.currentWaitlist", { defaultValue: "Current Waitlist" })}
          <span className="ml-2 text-sm text-neutral-500">({waitlist.length})</span>
        </h3>
      </div>

      {waitlist.length === 0 ? (
        <div className="text-center py-10 text-neutral-400">
          {t("admin:reservations.waitlistEmpty", { defaultValue: "Waitlist is empty" })}
        </div>
      ) : (
        <div className="space-y-2">
          {waitlist.map((entry, index) => {
            const waitTime = Math.round((Date.now() - new Date(entry.added_at).getTime()) / 60000);
            return (
              <div key={entry.id} className="bg-white border rounded-xl p-3 flex items-center gap-3" data-testid={`waitlist-${entry.id}`}>
                <span className="w-8 h-8 rounded-full bg-primary text-white font-bold flex items-center justify-center text-sm">
                  {index + 1}
                </span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{entry.customer_name}</span>
                    <span className="text-sm text-neutral-500">×{entry.party_size}</span>
                  </div>
                  <div className="text-xs text-neutral-500">
                    {t("admin:reservations.waitingFor", { defaultValue: "Waiting" })}: {waitTime}min
                    {entry.quoted_wait_minutes ? ` (quoted ${entry.quoted_wait_minutes}min)` : ""}
                  </div>
                  {entry.customer_phone && <div className="text-xs text-neutral-400">{entry.customer_phone}</div>}
                </div>
                <span className={`px-2 py-1 rounded text-xs font-semibold ${STATUS_COLORS[entry.status] || ""}`}>
                  {entry.status}
                </span>
                <div className="flex gap-1">
                  {entry.status === "waiting" && (
                    <Button variant="primary" size="sm" onClick={() => void handleAction("call", entry.id)}>
                      {t("admin:reservations.call", { defaultValue: "Call" })}
                    </Button>
                  )}
                  {entry.status === "called" && (
                    <Button variant="primary" size="sm" onClick={() => void handleAction("seat", entry.id)}>
                      {t("admin:reservations.seat", { defaultValue: "Seat" })}
                    </Button>
                  )}
                  {["waiting", "called"].includes(entry.status) && (
                    <Button variant="ghost" size="sm" onClick={() => void handleAction("left", entry.id)}>
                      {t("admin:reservations.left", { defaultValue: "Left" })}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
