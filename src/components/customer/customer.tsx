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

export interface Props {
  onAttach?: () => void;
}
export const Customers = ({
  onAttach
}: Props) => {
  const [state, setState] = useAtom(appState);
  const {t} = useTranslation(["orders", "common"]);

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
        <Button type="button" variant="primary" filled onClick={onAttach}>{t("customer.attach")}</Button>
      </div>
      <div className="h-[2px] bg-gray-300 my-5"/>
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
                  onClick={() => {
                    setState(prev => ({
                      ...prev,
                      customer: item
                    }));

                    onAttach();
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
