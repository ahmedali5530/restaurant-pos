import React, { useState } from "react";
import { Input } from "@/components/common/input/input.tsx";
import { Button } from "@/components/common/input/button.tsx";
import { useAtom } from "jotai";
import { appState } from "@/store/jotai.ts";

export interface Props {
  onAttach?: () => void;
}
export const Customers = ({
  onAttach
}: Props) => {
  const [state, setState] = useAtom(appState);

  const [search, setSearch] = useState("");

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
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Addr.</th>
              <th>Secondary Addr.</th>
              <th>Points</th>
            </tr>
          </thead>
        </table>
      </div>
    </>
  )
}
