import { Button } from "@/components/common/input/button.tsx";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { nanoid } from "nanoid";
import ScrollContainer from "react-indiana-drag-scroll";
import React, { useMemo } from "react";
import { useAtom } from "jotai";
import { appState } from "@/store/jotai.ts";
import { useTranslation } from "react-i18next";

export const Seats = () => {
  const [state, setState] = useAtom(appState);
  const { t } = useTranslation('cart');

  const noSeat = useMemo(() => {
    return state.cart.some(item => item.seat === undefined);
  }, [state.cart]);

  return (
    <ScrollContainer>
      <div className="flex gap-2">
        <Button variant="warning" size="lg" icon={faPlus} onClick={() => {
          const newSeat = nanoid();
          setState(prev => ({
            ...prev,
            seats: [
              ...prev.seats,
              newSeat
            ],
            seat: newSeat
          }))
        }}>{t('seats.seat')}</Button>
        {noSeat && (
          <Button
            size="lg"
            className="btn btn-primary whitespace-nowrap" active={undefined === state.seat}
            onClick={() => setState(prev => ({
              ...prev,
              seat: undefined
            }))}
          >{t('seats.noSeat')}</Button>
        )}
        {state.seats.map((item, index) => (
          <Button
            size="lg"
            className="btn btn-primary whitespace-nowrap" active={item === state.seat}
            onClick={() => setState(prev => ({
              ...prev,
              seat: item
            }))}
            key={index}
          >{t('seats.seatNumber', { number: index + 1 })}</Button>
        ))}
      </div>
    </ScrollContainer>
  )
}
