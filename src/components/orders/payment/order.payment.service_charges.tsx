import {Button} from "@/components/common/input/button.tsx";
import React, {useEffect, useMemo, useRef, useState} from "react";
import {DiscountType} from "@/api/model/discount.ts";
import {withCurrency} from "@/lib/utils.ts";
import {Order} from "@/api/model/order.ts";
import {useTranslation} from "react-i18next";
import {useAtom} from "jotai";
import {appSettings} from "@/store/jotai.ts";

interface Props {
  serviceCharge: number
  setServiceCharge: (charges: any) => void

  setServiceChargeType: (type: DiscountType) => void
  serviceChargeType: DiscountType

  order: Order
  /** When set, OK commits through this (PIN-protected) instead of setters directly. */
  onCommit?: (serviceCharge: number, serviceChargeType: DiscountType) => void
}

export const OrderPaymentServiceCharges = ({
  serviceCharge, setServiceCharge, serviceChargeType, setServiceChargeType, order, onCommit
}: Props) => {
  const {t} = useTranslation(['payment', 'common']);
  const [settings] = useAtom(appSettings);
  const [draftServiceCharge, setDraftServiceCharge] = useState<number>(serviceCharge);
  const [draftServiceChargeType, setDraftServiceChargeType] = useState<DiscountType>(serviceChargeType);
  const defaultAppliedRef = useRef(false);

  const [quickPercentOptions, setQuickPercentOptions] = useState([
    3, 5, 12, 15, 20,
  ]);
  const [quickFixedOptions, setQuickFixedOptions] = useState([
    50, 100, 500, 1000,
  ]);

  const keyboardKeys = [1, 2, 3, 4, 5, 6, 7, 8, 9, '.', 0];

  const serviceChargeSetting = useMemo(() => {
    return (settings.settings ?? []).find(
      (row) => row.key === 'service_charges' && (row.is_global === true || row.is_global == null),
    );
  }, [settings.settings]);

  const defaultFromSettings = useMemo(() => {
    const values = serviceChargeSetting?.values as any;
    const typeRaw = values?.type?.value ?? values?.type;
    const valueRaw = values?.value?.value ?? values?.value;
    const type = String(typeRaw || DiscountType.Percent) === DiscountType.Fixed ? DiscountType.Fixed : DiscountType.Percent;
    const value = Number(valueRaw || 0);

    return {
      value,
      type,
      label: type === DiscountType.Fixed ? `${withCurrency(value)}` : `${value}%`
    };
  }, [serviceChargeSetting]);

  useEffect(() => {
    setDraftServiceCharge(serviceCharge);
    setDraftServiceChargeType(serviceChargeType);
    defaultAppliedRef.current = false;
  }, [serviceCharge, serviceChargeType]);

  useEffect(() => {
    if (defaultFromSettings.value <= 0) {
      return;
    }

    if (defaultFromSettings.type === DiscountType.Fixed) {
      setQuickFixedOptions(prev => {
        const optionsSet = new Set(prev);
        optionsSet.add(defaultFromSettings.value);
        return Array.from(optionsSet);
      });
      return;
    }

    setQuickPercentOptions(prev => {
      const optionsSet = new Set(prev);
      optionsSet.add(defaultFromSettings.value);
      return Array.from(optionsSet);
    });
  }, [defaultFromSettings.type, defaultFromSettings.value]);

  const allowServiceCharges = order.order_type?.allow_service_charges === true;

  useEffect(() => {
    if (
      defaultAppliedRef.current ||
      serviceCharge !== 0 ||
      !allowServiceCharges ||
      defaultFromSettings.value <= 0
    ) {
      return;
    }

    setDraftServiceCharge(defaultFromSettings.value);
    setDraftServiceChargeType(defaultFromSettings.type);
    defaultAppliedRef.current = true;
  }, [defaultFromSettings, allowServiceCharges, serviceCharge]);

  return (
    <div className="flex flex-col justify-between h-full" data-testid="payment-panel-service-charges">
      <div className="mb-5 flex justify-between flex-col gap-5">
        <div className="text-xl bg-warning px-3 py-5 text-white">
          {t('serviceCharges.defaultFromSettings')} <span className="font-semibold ">{defaultFromSettings.label}</span>
        </div>
        <Button
          className="min-w-[150px]"
          variant="danger"
          active={draftServiceCharge === 0}
          onClick={() => setDraftServiceCharge(0)}
          size="lg"
        >
          {t('serviceCharges.noServiceCharge')}
        </Button>
        <div className="input-group">
          <Button
            size="lg"
            variant="primary"
            active={draftServiceChargeType === DiscountType.Percent}
            onClick={() => setDraftServiceChargeType(DiscountType.Percent)}
            className="min-w-[150px] flex-1"
          >
            {t('discountType.percent')}
          </Button>
          <Button
            size="lg"
            variant="primary"
            active={draftServiceChargeType === DiscountType.Fixed}
            onClick={() => setDraftServiceChargeType(DiscountType.Fixed)}
            className="min-w-[150px] flex-1"
          >
            {t('discountType.fixed')}
          </Button>
        </div>
      </div>

      {draftServiceChargeType === DiscountType.Percent && (
        <div className="flex flex-wrap gap-3 mb-3 justify-center">
          {quickPercentOptions.map(item => (
            <Button
              className="min-w-[100px]"
              variant="primary"
              flat
              active={draftServiceCharge === item && draftServiceChargeType === DiscountType.Percent}
              onClick={() => {
                setDraftServiceCharge(item);
                setDraftServiceChargeType(DiscountType.Percent);
              }}
              key={item}
              size="lg"
            >
              {item}%
            </Button>
          ))}
        </div>
      )}

      {draftServiceChargeType === DiscountType.Fixed && (
        <div className="flex flex-wrap gap-3 mb-3 justify-center">
          {quickFixedOptions.map(item => (
            <Button
              className="min-w-[100px]"
              variant="primary"
              flat
              active={draftServiceCharge === item && draftServiceChargeType === DiscountType.Fixed}
              onClick={() => {
                setDraftServiceCharge(item);
                setDraftServiceChargeType(DiscountType.Fixed);
              }}
              key={item}
              size="lg"
            >
              {item}
            </Button>
          ))}
        </div>
      )}

      <div className="text-2xl text-center mb-3" data-testid="payment-service-charges-draft-value">
        {draftServiceChargeType === DiscountType.Percent
          ? `${draftServiceCharge}%`
          : withCurrency(draftServiceCharge)}
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        {keyboardKeys.map((item) => (
          <Button
            key={String(item)}
            size="xl"
            flat
            variant="primary"
            onClick={() => {
              setDraftServiceCharge((prev) => Number(`${prev.toString()}${item}`));
            }}
          >
            {item}
          </Button>
        ))}
        <Button
          size="xl"
          flat
          variant="primary"
          onClick={() => {
            setDraftServiceCharge(0);
          }}
        >
          C
        </Button>
      </div>

      <Button
        variant="success"
        filled
        size="lg"
        className="w-full"
        data-testid="payment-service-charges-apply"
        onClick={() => {
          if (onCommit) {
            onCommit(draftServiceCharge, draftServiceChargeType);
            return;
          }
          setServiceCharge(draftServiceCharge);
          setServiceChargeType(draftServiceChargeType);
        }}
      >
        {t('common:actions.ok')}
      </Button>
    </div>
  );
};
