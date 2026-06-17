import {Button} from "@/components/common/input/button.tsx";
import React, {useEffect, useMemo, useRef, useState} from "react";
import {DiscountType} from "@/api/model/discount.ts";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {Setting} from "@/api/model/setting.ts";
import {withCurrency} from "@/lib/utils.ts";
import {Order} from "@/api/model/order.ts";
import {useTranslation} from "react-i18next";

interface Props {
  serviceCharge: number
  setServiceCharge: (charges: any) => void

  setServiceChargeType: (type: DiscountType) => void
  serviceChargeType: DiscountType

  order: Order
}

export const OrderPaymentServiceCharges = ({
  serviceCharge, setServiceCharge, serviceChargeType, setServiceChargeType, order
}: Props) => {
  const {t} = useTranslation('payment');
  const [draftServiceCharge, setDraftServiceCharge] = useState<number>(serviceCharge);
  const [draftServiceChargeType, setDraftServiceChargeType] = useState<DiscountType>(serviceChargeType);
  const defaultAppliedRef = useRef(false);

  const [quickPercentOptions, setQuickPercentOptions] = useState([
    3, 5, 12
  ]);

  const keyboardKeys = [1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0];

  const {
    data: serviceChargeSettings,
  } = useApi<SettingsData<Setting>>(Tables.settings, ["(key = 'service_charges' and is_global = true)"], [], 0, 1, ["values"]);

  const defaultFromSettings = useMemo(() => {
    const values = serviceChargeSettings?.data?.[0]?.values;
    const typeRaw = values?.type?.value ?? values?.type;
    const valueRaw = values?.value?.value ?? values?.value;
    const type = String(typeRaw || DiscountType.Percent) === DiscountType.Fixed ? DiscountType.Fixed : DiscountType.Percent;
    const value = Number(valueRaw || 0);

    return {
      value,
      type,
      label: type === DiscountType.Fixed ? `${withCurrency(value)}` : `${value}%`
    };
  }, [serviceChargeSettings]);

  useEffect(() => {
    setDraftServiceCharge(serviceCharge);
    setDraftServiceChargeType(serviceChargeType);
    defaultAppliedRef.current = false;
  }, [serviceCharge, serviceChargeType]);

  useEffect(() => {
    if (defaultFromSettings.value <= 0) {
      return;
    }

    setQuickPercentOptions(prev => {
      const optionsSet = new Set(prev);
      optionsSet.add(defaultFromSettings.value);
      return Array.from(optionsSet);
    });
  }, [defaultFromSettings.value]);

  useEffect(() => {
    if (
      defaultAppliedRef.current ||
      serviceCharge !== 0 ||
      !order.order_type.allow_service_charges ||
      defaultFromSettings.value <= 0
    ) {
      return;
    }

    setDraftServiceCharge(defaultFromSettings.value);
    setDraftServiceChargeType(defaultFromSettings.type);
    defaultAppliedRef.current = true;
  }, [defaultFromSettings, order.order_type.allow_service_charges, serviceCharge]);

  return (
    <div className="flex flex-col justify-between h-full">
      <div className="mb-5 flex justify-between flex-col gap-5">
        <div className="text-xl bg-warning-500 px-3 py-5 text-white">
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
            size="lg" variant="primary" active={draftServiceChargeType === DiscountType.Percent}
            onClick={() => setDraftServiceChargeType(DiscountType.Percent)}
            className="min-w-[150px] flex-1"
          >
            {t('discountType.percent')}
          </Button>
          <Button
            size="lg" variant="primary" active={draftServiceChargeType === DiscountType.Fixed}
            onClick={() => setDraftServiceChargeType(DiscountType.Fixed)}
            className="min-w-[150px] flex-1"
          >
            {t('discountType.fixed')}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-3 justify-center">
        {quickPercentOptions.map(quickOption => (
          <Button
            size="lg" variant="primary" flat active={draftServiceCharge === quickOption}
            onClick={() => {
              setDraftServiceCharge(quickOption);
            }}
            className="min-w-[100px]"
            key={quickOption}
          >
            {quickOption}{draftServiceChargeType === DiscountType.Percent && '%'}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        {keyboardKeys.map(item => (
          <Button key={item} size="xl" flat variant="primary" onClick={() => {
            setDraftServiceCharge(prev => {
              return Number(prev.toString() + item)
            });
          }}>
            {item}
          </Button>
        ))}
        <Button size="xl" flat variant="primary" onClick={() => {
          setDraftServiceCharge(0)
        }}>
          C
        </Button>
      </div>
      <Button
        variant="success"
        size="lg"
        onClick={() => {
          setServiceCharge(draftServiceCharge);
          setServiceChargeType(draftServiceChargeType);
        }}
        className="w-full"
        filled
      >
        {t('common:actions.ok')}
      </Button>
    </div>
  )
}
