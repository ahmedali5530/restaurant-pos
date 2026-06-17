import {useEffect, useState} from "react";
import { useTranslation } from 'react-i18next';
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {toast} from "sonner";
import {Checkbox} from "@/components/common/input/checkbox.tsx";
import {Input} from "@/components/common/input/input.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {useForm, Controller, useFieldArray, useWatch} from "react-hook-form";
import * as yup from "yup";
import {yupResolver} from "@hookform/resolvers/yup";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faPlus, faTrash} from "@fortawesome/free-solid-svg-icons";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import {Menu} from "@/api/model/menu.ts";
import {StringRecordId} from "surrealdb";

interface DeliveryTimingEntry {
  id: string;
  day_or_date: string; // Day of week (e.g., "Monday") or specific date (e.g., "2024-12-25")
  start_time: string; // Format: "HH:mm"
  end_time: string; // Format: "HH:mm"
  is_end_time_next_day: boolean;
  enable_delivery: boolean;
}

interface DeliverySettingsForm {
  enable_delivery: boolean;
  delivery_charges: number;
  minimum_order: number;
  map_center: {
    lat: number;
    lng: number;
  };
  delivery_timing: DeliveryTimingEntry[];
  delivery_menu: {
    label: string
    value: string
  },
  delivery_time?: number
}

const DAYS_OF_WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday"
];

const getDefaultDeliveryTiming = (): DeliveryTimingEntry[] => {
  return DAYS_OF_WEEK.map((day, index) => ({
    id: `day-${index}`,
    day_or_date: day,
    start_time: "11:00",
    end_time: "00:00",
    is_end_time_next_day: true,
    enable_delivery: true
  }));
};

const validationSchema = yup.object({
  enable_delivery: yup.boolean(),
  delivery_menu: yup.object({
    label: yup.string(),
    value: yup.string()
  }).required('This is required'),
  delivery_charges: yup.number().min(0, "Delivery charges must be positive").required("This is required"),
  delivery_time: yup.number().min(0, "Delivery time must be positive").required("This is required"),
  minimum_order: yup.number().min(0, "Minimum order must be positive").required("This is required"),
  map_center: yup.object({
    lat: yup.number().required("Latitude is required"),
    lng: yup.number().required("Longitude is required")
  }).required("Map center is required"),
  delivery_timing: yup.array().of(
    yup.object({
      id: yup.string().required(),
      day_or_date: yup.string().required("Day or date is required"),
      start_time: yup.string().required("Start time is required"),
      end_time: yup.string().required("End time is required"),
      is_end_time_next_day: yup.boolean(),
      enable_delivery: yup.boolean()
    })
  )
});

export const DeliverySettings = () => {
  const { t } = useTranslation('delivery');
  const db = useDB();
  const [loading, setLoading] = useState(true);
  const {
    data: menus
  } = useApi<SettingsData<Menu>>(Tables.menus, ['active = true and deleted_at = none']);

  const {control, handleSubmit, reset, formState: {errors, isSubmitting}} = useForm({
    resolver: yupResolver(validationSchema),
    defaultValues: {
      enable_delivery: false,
      delivery_charges: 0,
      minimum_order: 0,
      map_center: { lat: 31.512196, lng: 74.322242 },
      delivery_timing: getDefaultDeliveryTiming(),
      delivery_time: 0
    }
  });

  const {fields, append, remove} = useFieldArray({
    control,
    name: "delivery_timing"
  });

  const deliveryTimingValues = useWatch({
    control,
    name: "delivery_timing"
  });

  // Load delivery settings from database
  useEffect(() => {
    const loadDeliverySettings = async () => {
      try {
        setLoading(true);
        const settingsKeys = ['enable_delivery', 'delivery_charges', 'minimum_order', 'map_center', 'delivery_timing', 'delivery_menu', 'delivery_time'];
        const formValues: Partial<DeliverySettingsForm> = {};
        
        for (const key of settingsKeys) {
          const [result] = await db.query(
            `SELECT * FROM ${Tables.settings} WHERE key = $key LIMIT 1 FETCH values`,
            { key }
          );

          if (result.length > 0) {
            const setting = result[0];
            const value = setting?.values;
            
            if (key === 'enable_delivery') {
              formValues.enable_delivery = value === true || value === 'true' || value === 1;
            } else if (key === 'delivery_charges') {
              formValues.delivery_charges = typeof value === 'number' ? value : parseFloat(value) || 0;
            } else if (key === 'minimum_order') {
              formValues.minimum_order = typeof value === 'number' ? value : parseFloat(value) || 0;
            } else if (key === 'map_center') {
              if (value && typeof value === 'object') {
                formValues.map_center = {
                  lat: typeof value.lat === 'number' ? value.lat : parseFloat(value.lat) || 0,
                  lng: typeof value.lng === 'number' ? value.lng : parseFloat(value.lng) || 0
                };
              }
            } else if (key === 'delivery_timing') {
              if (Array.isArray(value) && value.length > 0) {
                formValues.delivery_timing = value;
              }
            } else if(key === 'delivery_menu' && typeof value === 'object'){

              formValues.delivery_menu = {
                label: value.name,
                value: value.id
              };
            }else if(key === 'delivery_time'){
              formValues.delivery_time = value;
            }
          }
        }

        // Reset form with loaded values
        reset({
          enable_delivery: formValues.enable_delivery ?? false,
          delivery_charges: formValues.delivery_charges ?? 0,
          minimum_order: formValues.minimum_order ?? 0,
          map_center: formValues.map_center ?? { lat: 31.512196, lng: 74.322242 },
          delivery_timing: formValues.delivery_timing ?? getDefaultDeliveryTiming(),
          delivery_menu: formValues.delivery_menu ? formValues.delivery_menu : null,
          delivery_time: formValues.delivery_time ? formValues.delivery_time : 0
        });
      } catch (error) {
        console.error("Error loading delivery settings:", error);
        toast.error(t('settings.loadFailed'));
      } finally {
        setLoading(false);
      }
    };

    loadDeliverySettings();
  }, []);

  // Save delivery settings
  const onSubmit = async (values: DeliverySettingsForm) => {
    try {
      const settings = [
        {key: 'enable_delivery', value: values.enable_delivery},
        {key: 'delivery_charges', value: values.delivery_charges},
        {key: 'minimum_order', value: values.minimum_order},
        {key: 'map_center', value: values.map_center},
        {key: 'delivery_timing', value: values.delivery_timing},
        {key: 'delivery_menu', value: values.delivery_menu.value ? new StringRecordId(values.delivery_menu.value) : null},
        {key: 'delivery_time', value: values.delivery_time},
      ];

      for (const setting of settings) {
        const [result] = await db.query(
          `SELECT *
           FROM ${Tables.settings}
           WHERE key = $key LIMIT 1`,
          {key: setting.key}
        );

        if (result.length > 0) {
          // Update existing setting
          const existingSetting = result[0];
          await db.merge(existingSetting.id, {
            values: setting.value
          });
        } else {
          // Create new setting
          await db.create(Tables.settings, {
            key: setting.key,
            values: setting.value,
            is_global: true
          });
        }
      }

      toast.success(t('settings.saved'));
    } catch (error) {
      console.error("Error saving delivery settings:", error);
      toast.error(t('settings.saveFailed'));
    }
  };

  const addCustomDate = () => {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    append({
      id: `date-${Date.now()}`,
      day_or_date: dateStr,
      start_time: "09:00",
      end_time: "22:00",
      is_end_time_next_day: false,
      enable_delivery: false
    });
  };

  const isDayOfWeek = (dayOrDate: string): boolean => {
    return DAYS_OF_WEEK.includes(dayOrDate);
  };

  return (
    <>
      <div className="bg-white p-4">
        <div className="">
          <h2 className="text-xl font-bold mb-4">{t('settings.title')}</h2>
          
          {loading ? (
            <div className="text-center py-8">{t('settings.loading')}</div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)}>
              <div className="flex flex-col gap-4">
                <div>
                  <Controller
                    name="enable_delivery"
                    control={control}
                    render={({field}) => (
                      <Checkbox
                        label={t('settings.enableDelivery')}
                        checked={field.value}
                        onChange={(e) => field.onChange(e.currentTarget.checked)}
                      />
                    )}
                  />
                </div>

                <div>
                  <Controller
                    name="delivery_charges"
                    control={control}
                    render={({field}) => (
                      <Input
                        type="number"
                        label={t('settings.deliveryCharges')}
                        value={field.value}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          field.onChange(val);
                        }}
                        min="0"
                        step="0.01"
                        error={errors.delivery_charges?.message}
                      />
                    )}
                  />
                </div>

                <div>
                  <Controller
                    name="minimum_order"
                    control={control}
                    render={({field}) => (
                      <Input
                        type="number"
                        label={t('settings.minimumOrder')}
                        value={field.value}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          if (val >= 0) {
                            field.onChange(val);
                          }
                        }}
                        min="0"
                        step="0.01"
                        error={errors.minimum_order?.message}
                      />
                    )}
                  />
                </div>

                <div>
                  <Controller
                    name="delivery_time"
                    control={control}
                    render={({field}) => (
                      <Input
                        type="number"
                        label={t('settings.deliveryTimeMinutes')}
                        value={field.value}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          if (val >= 0) {
                            field.onChange(val);
                          }
                        }}
                        min="0"
                        step="0.01"
                        error={errors.delivery_time?.message}
                      />
                    )}
                  />
                </div>

                <div>
                  <label htmlFor="delivery_menu">{t('settings.deliveryMenu')}</label>
                  <Controller
                    name="delivery_menu"
                    control={control}
                    render={({field}) => (
                      <ReactSelect
                        value={field.value}
                        onChange={field.onChange}
                        options={menus?.data?.map(item => ({
                          label: item.name,
                          value: item.id
                        }))}
                      />
                    )}
                  />
                </div>

                <div className="border-t pt-4 mt-2">
                  <h3 className="text-lg font-semibold mb-4">{t('settings.mapCenter')}</h3>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <Controller
                        name="map_center.lat"
                        control={control}
                        render={({field}) => (
                          <Input
                            type="number"
                            label={t('settings.latitude')}
                            value={field.value}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              field.onChange(val);
                            }}
                            step="0.000001"
                            error={errors.map_center?.lat?.message}
                          />
                        )}
                      />
                    </div>
                    <div className="flex-1">
                      <Controller
                        name="map_center.lng"
                        control={control}
                        render={({field}) => (
                          <Input
                            type="number"
                            label={t('settings.longitude')}
                            value={field.value}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              field.onChange(val);
                            }}
                            step="0.000001"
                            error={errors.map_center?.lng?.message}
                          />
                        )}
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4 mt-2">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">{t('settings.deliveryTiming')}</h3>
                    <Button
                      type="button"
                      variant="primary"
                      onClick={addCustomDate}
                      className="flex items-center gap-2"
                    >
                      <FontAwesomeIcon icon={faPlus} size="sm" />
                      Add Custom Date
                    </Button>
                  </div>
                  
                  <div className="flex flex-col gap-1">
                    {fields.map((field, index) => {
                      const isDefaultDay = isDayOfWeek(field.day_or_date);
                      const isDayOff = deliveryTimingValues?.[index]?.enable_delivery ?? false;
                      return (
                        <div key={field.id} className="border rounded-lg p-1 bg-gray-50">
                          <div className="flex items-end gap-3">
                            <div className="flex-1 min-w-[150px]">
                              <Controller
                                name={`delivery_timing.${index}.day_or_date`}
                                control={control}
                                render={({field: dayField}) => (
                                  <Input
                                    type={isDefaultDay ? "text" : "date"}
                                    label={isDefaultDay ? "Day of Week" : "Date"}
                                    value={dayField.value}
                                    onChange={dayField.onChange}
                                    disabled={isDefaultDay}
                                    error={errors.delivery_timing?.[index]?.day_or_date?.message}
                                  />
                                )}
                              />
                            </div>
                            <div className="flex-1 min-w-[120px]">
                              <Controller
                                name={`delivery_timing.${index}.start_time`}
                                control={control}
                                render={({field: timeField}) => (
                                  <Input
                                    type="time"
                                    label={t('settings.startTime')}
                                    value={timeField.value}
                                    onChange={timeField.onChange}
                                    // disabled={isDayOff}
                                    error={errors.delivery_timing?.[index]?.start_time?.message}
                                  />
                                )}
                              />
                            </div>
                            <div className="flex-1 min-w-[120px]">
                              <Controller
                                name={`delivery_timing.${index}.end_time`}
                                control={control}
                                render={({field: timeField}) => (
                                  <Input
                                    type="time"
                                    label={t('settings.endTime')}
                                    value={timeField.value}
                                    onChange={timeField.onChange}
                                    // disabled={isDayOff}
                                    error={errors.delivery_timing?.[index]?.end_time?.message}
                                  />
                                )}
                              />
                            </div>
                            <div className="flex items-center pb-2">
                              <Controller
                                name={`delivery_timing.${index}.is_end_time_next_day`}
                                control={control}
                                render={({field: checkboxField}) => (
                                  <Checkbox
                                    label={t('settings.endTimeNextDay')}
                                    checked={checkboxField.value}
                                    onChange={(e) => checkboxField.onChange(e.currentTarget.checked)}
                                    disabled={isDayOff}
                                  />
                                )}
                              />
                            </div>
                            <div className="flex items-center pb-2">
                              <Controller
                                name={`delivery_timing.${index}.enable_delivery`}
                                control={control}
                                render={({field: checkboxField}) => (
                                  <Checkbox
                                    label={t('settings.enableDeliveryQuestion')}
                                    checked={checkboxField.value}
                                    onChange={(e) => checkboxField.onChange(e.currentTarget.checked)}
                                  />
                                )}
                              />
                            </div>
                            {!isDefaultDay && (
                              <div className="flex items-center pb-2">
                                <Button
                                  type="button"
                                  variant="danger"
                                  onClick={() => remove(index)}
                                  className="text-red-600 hover:text-red-700"
                                >
                                  <FontAwesomeIcon icon={faTrash} size="sm" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-2">
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Saving..." : "Save Settings"}
                  </Button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
};
