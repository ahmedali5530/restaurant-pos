import React, {useEffect, useState} from "react";
import { Input } from "@/components/common/input/input.tsx";
import { Button } from "@/components/common/input/button.tsx";
import { useAtom } from "jotai";
import { appState } from "@/store/jotai.ts";
import {Customer} from "@/api/model/customer.ts";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {Checkbox} from "@/components/common/input/checkbox.tsx";
import {faCheck} from "@fortawesome/free-solid-svg-icons";

export interface Props {
  onAttach?: () => void;
}
export const Customers = ({
  onAttach
}: Props) => {
  const [state, setState] = useAtom(appState);
  const db = useDB();

  const [search, setSearch] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const loadCustomers = async (search: string) => {
    if(search.trim().length === 0){
      setCustomers([]);
      return;
    }

    const [list] = await db.query(`SELECT * FROM ${Tables.customers} where name contains $name or phone contains $name or email contains $name order by name limit 10`, {
      name: search
    });

    setCustomers(list);
  }

  useEffect(() => {
    loadCustomers(search)
  }, [search]);

  return (
    <>
      <div className="grid grid-cols-4 items-end gap-3 mb-3">
        <div>
          <Input
            label="Name"
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
            label="Phone Number"
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
            label="Address"
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
        <Button type="button" variant="primary" filled onClick={onAttach}>Attach</Button>
      </div>
      <div className="h-[2px] bg-gray-300 my-5"/>
      <div className="mb-3">
        <Input placeholder="Search" className="search-field" onChange={(event) => setSearch(event.target.value)} enableKeyboard />
      </div>

      <div className="mb-3">
        <table className="table">
          <thead>
            <tr>
              <th>Select</th>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Addr.</th>
              <th>Secondary Addr.</th>
              <th>Points</th>
            </tr>
          </thead>
          <tbody>
          {customers.map(item => (
            <tr>
              <td>
                <Button
                  icon={faCheck}
                  iconButton
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
