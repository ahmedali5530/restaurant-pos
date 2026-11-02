import React, {useEffect, useState} from "react";
import { Input } from "@/components/common/input/input.tsx";
import { Button } from "@/components/common/input/button.tsx";
import { IconTooltipButton } from "@/components/common/input/icon.tooltip.button.tsx";
import { useAtom } from "jotai";
import { appState } from "@/store/jotai.ts";
import {Customer} from "@/api/model/customer.ts";
import {faCheck} from "@fortawesome/free-solid-svg-icons";
import {useTranslation} from "react-i18next";
import {posStore} from "@/infrastructure/pos-store/pos-store.ts";
import { terminalSyncService } from "@/infrastructure/sync/sync-service.ts";
import { toast } from "sonner";

export interface Props {
  onAttach?: () => void;
}
export const Customers = ({
  onAttach
}: Props) => {
  const [state, setState] = useAtom(appState);
  const {t} = useTranslation(["orders", "common"]);
  const [attaching, setAttaching] = useState(false);

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

  /**
   * Keep customer on the open check when the order is already punched.
   * New checks keep the customer in app state until createOrderWithItems.
   */
  const persistCustomerOnOrder = async (customer: Customer | undefined | null) => {
    const orderId = state?.order?.id;
    if (!orderId || orderId === 'new' || !customer) {
      return customer ?? undefined;
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
      return nextCustomer;
    }

    const seed = {
      order: state?.order?.order ?? { id: orderId },
      items: state?.order?.order?.items,
    };
    await posStore.mergeOrder(
      String(orderId),
      { customer: customerId },
      { seed },
    );
    setState((prev) => ({
      ...prev,
      customer: nextCustomer,
      order: {
        ...prev.order,
        order: prev.order?.order
          ? { ...prev.order.order, customer: nextCustomer }
          : ({ id: orderId, customer: nextCustomer } as any),
      },
    }));
    void terminalSyncService.synchronize().catch(() => undefined);
    return nextCustomer;
  };

  const attachCustomer = async (customer: Customer | undefined | null) => {
    if (attaching) return;
    setAttaching(true);
    try {
      // Always put the selection into app state first (covers new / unpunched checks).
      setState((prev) => ({ ...prev, customer: customer ?? undefined }));
      await persistCustomerOnOrder(customer);
      onAttach?.();
    } catch (error) {
      console.error('Failed to attach customer to order', error);
      toast.error(t('customer.attachFailed', {
        defaultValue: 'Could not attach customer to this order',
      }));
    } finally {
      setAttaching(false);
    }
  };

  return (
    <>
      <div className="grid grid-cols-4 items-end gap-3 mb-3">
        <div>
          <Input
            label={t("customer.name")}
            value={state.customer?.name}
            onChange={(event) => setState(prev => ({
              ...prev,
              customer: {
                ...prev.customer,
                name: event.target.value
              }
            }))}
            enableKeyboard
          />
        </div>
        <div>
          <Input
            type="number"
            label={t("customer.phone")}
            value={state.customer?.phone}
            onChange={(event) => setState(prev => ({
              ...prev,
              customer: {
                ...prev.customer,
                phone: Number(event.target.value)
              }
            }))}
            enableKeyboard
          />
        </div>
        <div>
          <Input
            label={t("customer.address")}
            value={state.customer?.address}
            onChange={(event) => setState(prev => ({
              ...prev,
              customer: {
                ...prev.customer,
                address: event.target.value
              }
            }))}
            enableKeyboard
          />
        </div>
        <Button
          type="button"
          variant="primary"
          filled
          disabled={attaching || !state.customer?.name}
          onClick={() => void attachCustomer(state.customer)}
        >
          {t("customer.attach")}
        </Button>
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
                <IconTooltipButton
                  label={t('common:actions.select')}
                  icon={faCheck}
                  disabled={attaching}
                  onClick={() => {
                    void attachCustomer(item);
                  }}
                  variant="secondary"
                />
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
