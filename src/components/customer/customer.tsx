import React, {useEffect, useState} from "react";
import { Input } from "@/components/common/input/input.tsx";
import { Button } from "@/components/common/input/button.tsx";
import { IconTooltipButton } from "@/components/common/input/icon.tooltip.button.tsx";
import { useAtom } from "jotai";
import { appState } from "@/store/jotai.ts";
import {Customer} from "@/api/model/customer.ts";
import {faCheck, faPen, faUserSlash} from "@fortawesome/free-solid-svg-icons";
import {useTranslation} from "react-i18next";
import {posStore} from "@/infrastructure/pos-store/pos-store.ts";
import { terminalSyncService } from "@/infrastructure/sync/sync-service.ts";
import { toast } from "sonner";

export interface Props {
  onAttach?: () => void;
  onRemove?: () => void;
}
export const Customers = ({
  onAttach,
  onRemove,
}: Props) => {
  const [state, setState] = useAtom(appState);
  const {t} = useTranslation(["orders", "common"]);
  const [busy, setBusy] = useState(false);
  /** Form draft — separate from attached order customer until save/attach. */
  const [draft, setDraft] = useState<Partial<Customer>>(() => state.customer ?? {});

  const [search, setSearch] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const loadCustomers = async (query: string) => {
    if(query.trim().length === 0){
      setCustomers([]);
      return;
    }

    const list = await posStore.searchCustomers(query, 10);
    setCustomers(list as Customer[]);
  }

  useEffect(() => {
    void loadCustomers(search)
  }, [search]);

  useEffect(() => {
    if (state.customer?.id) {
      setDraft(state.customer);
    }
  }, [state.customer?.id]);

  const patchOrderCustomer = (customer: Customer | undefined) => {
    setState((prev) => ({
      ...prev,
      customer,
      order: prev.order?.id
        ? {
            ...prev.order,
            order: prev.order.order
              ? { ...prev.order.order, customer: customer ?? null }
              : prev.order.order,
          }
        : prev.order,
    }));
  };

  /**
   * Keep customer on the open check when the order is already punched.
   * New checks keep the customer in app state until createOrderWithItems.
   * Pass null/undefined to clear the customer from a punched order.
   */
  const persistCustomerOnOrder = async (customer: Customer | undefined | null) => {
    const orderId = state?.order?.id;
    if (!orderId || orderId === 'new') {
      return customer ?? undefined;
    }

    const seed = {
      order: state?.order?.order ?? { id: orderId },
      items: state?.order?.order?.items,
    };

    if (!customer) {
      await posStore.mergeOrder(
        String(orderId),
        { customer: null },
        { seed },
      );
      patchOrderCustomer(undefined);
      void terminalSyncService.synchronize().catch(() => undefined);
      return undefined;
    }

    let nextCustomer = customer;
    let customerId = customer.id != null ? String(customer.id) : null;

    if (!customerId) {
      const created = await posStore.createCustomer({ ...customer });
      customerId = String(created.id);
      nextCustomer = { ...customer, id: created.id } as Customer;
    }

    const existingId = state?.order?.order?.customer
      ? String((state.order.order.customer as any)?.id ?? state.order.order.customer)
      : null;
    if (customerId === existingId) {
      // Still refresh embedded customer object after edits.
      patchOrderCustomer(nextCustomer);
      return nextCustomer;
    }

    await posStore.mergeOrder(
      String(orderId),
      { customer: customerId },
      { seed },
    );
    patchOrderCustomer(nextCustomer);
    void terminalSyncService.synchronize().catch(() => undefined);
    return nextCustomer;
  };

  const attachCustomer = async (customer: Customer | undefined | null) => {
    if (busy || !customer?.name) return;
    setBusy(true);
    try {
      let next = customer;
      if (customer.id != null) {
        const updated = await posStore.updateCustomer({ ...customer });
        next = { ...customer, ...updated, id: updated.id } as Customer;
        setCustomers((prev) =>
          prev.map((row) => (String(row.id) === String(updated.id) ? { ...row, ...next } : row)),
        );
      }
      setDraft(next);
      patchOrderCustomer(next);
      await persistCustomerOnOrder(next);
      onAttach?.();
    } catch (error) {
      console.error('Failed to attach customer to order', error);
      toast.error(t('customer.attachFailed', {
        defaultValue: 'Could not attach customer to this order',
      }));
    } finally {
      setBusy(false);
    }
  };

  const saveCustomer = async () => {
    if (busy || !draft?.name || draft.id == null) return;
    setBusy(true);
    try {
      const updated = await posStore.updateCustomer({ ...draft });
      const next = { ...draft, ...updated, id: updated.id } as Customer;
      setDraft(next);
      setCustomers((prev) =>
        prev.map((row) => (String(row.id) === String(updated.id) ? { ...row, ...next } : row)),
      );
      const attachedId = state.customer?.id != null ? String(state.customer.id) : null;
      if (attachedId && attachedId === String(updated.id)) {
        patchOrderCustomer(next);
      }
      toast.success(t('customer.saved', { defaultValue: 'Customer saved' }));
      void terminalSyncService.synchronize().catch(() => undefined);
    } catch (error) {
      console.error('Failed to update customer', error);
      toast.error(t('customer.saveFailed', {
        defaultValue: 'Could not save customer',
      }));
    } finally {
      setBusy(false);
    }
  };

  const removeCustomer = async () => {
    if (busy) return;
    setBusy(true);
    try {
      setDraft({});
      patchOrderCustomer(undefined);
      await persistCustomerOnOrder(null);
      onRemove?.();
      onAttach?.();
    } catch (error) {
      console.error('Failed to remove customer from order', error);
      toast.error(t('customer.removeFailed', {
        defaultValue: 'Could not remove customer from this order',
      }));
    } finally {
      setBusy(false);
    }
  };

  const editingExisting = draft?.id != null;
  const hasAttached = state.customer != null && (state.customer.name || state.customer.id);

  return (
    <>
      <div className="grid grid-cols-3 items-end gap-3 mb-3">
        <div>
          <Input
            label={t("customer.name")}
            value={draft?.name ?? ''}
            onChange={(event) => setDraft((prev) => ({
              ...prev,
              name: event.target.value
            }))}
            enableKeyboard
          />
        </div>
        <div>
          <Input
            type="number"
            label={t("customer.phone")}
            value={draft?.phone ?? ''}
            onChange={(event) => setDraft((prev) => ({
              ...prev,
              phone: event.target.value === '' ? undefined : Number(event.target.value)
            }))}
            enableKeyboard
          />
        </div>
        <div>
          <Input
            label={t("customer.address")}
            value={draft?.address ?? ''}
            onChange={(event) => setDraft((prev) => ({
              ...prev,
              address: event.target.value
            }))}
            enableKeyboard
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {editingExisting && (
          <Button
            type="button"
            variant="secondary"
            filled
            disabled={busy || !draft?.name}
            onClick={() => void saveCustomer()}
            data-testid="customer-save"
          >
            {t("customer.save")}
          </Button>
        )}
        <Button
          type="button"
          variant="primary"
          filled
          disabled={busy || !draft?.name}
          onClick={() => void attachCustomer(draft as Customer)}
          data-testid="customer-attach"
        >
          {t("customer.attach")}
        </Button>
        {hasAttached && (
          <Button
            type="button"
            variant="danger"
            disabled={busy}
            onClick={() => void removeCustomer()}
            icon={faUserSlash}
            data-testid="customer-remove"
          >
            {t("customer.remove")}
          </Button>
        )}
      </div>
      <div className="h-[2px] bg-border my-5"/>
      <div className="mb-3">
        <Input placeholder={t("customer.search")} className="search-field" onChange={(event) => setSearch(event.target.value)} enableKeyboard />
      </div>

      <div className="mb-3">
        <table className="table">
          <thead>
            <tr>
              <th>{t("customer.columns.select")}</th>
              <th>{t("customer.columns.name")}</th>
              <th>{t("customer.columns.email")}</th>
              <th>{t("customer.columns.phone")}</th>
              <th>{t("customer.columns.address")}</th>
              <th>{t("customer.columns.secondaryAddress")}</th>
              <th>{t("customer.columns.points")}</th>
            </tr>
          </thead>
          <tbody>
          {customers.map(item => (
            <tr key={String(item.id ?? `${item.name}-${item.phone}`)}>
              <td>
                <div className="flex gap-1">
                  <IconTooltipButton
                    label={t('common:actions.select')}
                    icon={faCheck}
                    disabled={busy}
                    onClick={() => {
                      void attachCustomer(item);
                    }}
                    variant="secondary"
                  />
                  <IconTooltipButton
                    label={t('common:actions.edit')}
                    icon={faPen}
                    disabled={busy}
                    onClick={() => {
                      setDraft(item);
                    }}
                    variant="primary"
                    data-testid={`customer-edit-${String(item.id)}`}
                  />
                </div>
              </td>
              <td>{item.name}</td>
              <td>{item.email}</td>
              <td>{item.phone}</td>
              <td>{item.address}</td>
              <td>{item.secondary_address}</td>
              <td>{item.points}</td>
            </tr>
          ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
