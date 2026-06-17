import { Button } from "@/components/common/input/button.tsx";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useAtom } from "jotai";
import {RecordId} from "surrealdb";
import { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import useApi, { SettingsData } from "@/api/db/use.api.ts";
import { ReactSelect } from "@/components/common/input/custom.react.select.tsx";
import { toast } from "sonner";
import {appPage, appSettings} from "@/store/jotai.ts";
import {toRecordId} from "@/lib/utils.ts";
import {useSecurity} from "@/hooks/useSecurity.ts";
import {Menu} from "@/api/model/menu.ts";
import {useTranslation} from 'react-i18next';


export const MenusSettings = () => {
  const db = useDB();
  const [page] = useAtom(appPage);
  const [, setAppSettings] = useAtom(appSettings);

  const [loading, setLoading] = useState(true);
  const userId = page?.user?.id?.toString();
  const {protectFormSubmit} = useSecurity();
  const { t } = useTranslation(['settings', 'common']);

  const { data: menus } = useApi<SettingsData<Menu>>(
    Tables.menus,
    ['active = true and deleted_at = none'],
    ["priority asc"],
    0,
    99999
  );

  const { control, handleSubmit, reset, formState: { isSubmitting } } = useForm();

  const [settingId, setSettingId] = useState<RecordId>();

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);

        const [settings] = await db.query(`SELECT * FROM ${Tables.settings} where key = $key and is_global = true fetch values`, {
          key: 'menus'
        })

        if(settings.length > 0 && Array.isArray(settings[0].values)) {
          reset({
            menus: settings[0].values.map(item => ({
              label: item.name,
              value: item.id
            }))
          });

          setSettingId(settings[0].id);
        }
      } catch (e) {
        console.error("Error loading menu settings:", e);
        toast.error(t('settings:menus.loadFailed'));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [menus, userId]);

  const fetchMenus = async (ids: RecordId[]) => {
    const [rows] = await db.query<Menu[]>(`SELECT * FROM ${Tables.menus}
                                           WHERE id INSIDE $ids
                                           FETCH items, items.menu_item, items.menu_item.categories, items.tax`, {
      ids
    });

    return Array.isArray(rows) ? rows : [];
  };

  const onSubmit = async (values: any) => {
    if (!userId) {
      toast.error(t('settings:menus.loginRequired'));
      return;
    }
    try {
      const selectedMenus = Array.isArray(values?.menus)
        ? values.menus.map((item: { value: string }) => toRecordId(item.value))
        : [];

      console.log(settingId)

      if(settingId){
        await db.merge(settingId, {
          key: 'menus',
          is_global: true,
          values: selectedMenus
        });
      }else{
        const [setting] = await db.insert(Tables.settings, {
          key: 'menus',
          is_global: true,
          values: selectedMenus
        });

        setSettingId(setting.id);
      }

      let resolvedMenus: Menu[] = [];
      if(selectedMenus.length > 0){
        resolvedMenus = await fetchMenus(selectedMenus);
      }

      setAppSettings(prev => ({
        ...prev,
        menus: resolvedMenus
      }));

      toast.success(t('settings:menus.saved'));
    } catch (e) {
      console.error("Error saving menu settings:", e);
      toast.error(t('settings:menus.saveFailed'));
    }
  };

  return (
    <div className="shadow p-5 rounded bg-white">
      <h2 className="text-xl font-semibold mb-1">{t('settings:menus.title')}</h2>
      <p className="text-sm text-neutral-500 mb-4"></p>

      {loading ? (
        <div className="text-center py-6 text-neutral-500">{t('settings:menus.loading')}</div>
      ) : (
        <form onSubmit={protectFormSubmit((handleSubmit(onSubmit)), {
          description: t('settings:menus.saveDescription'),
          module: 'Menus'
        })} className="flex flex-col gap-4 max-w-xl">
          <div>
            <label className="block text-sm font-medium mb-1">{t('settings:menus.activateMenus')}</label>
            <Controller
              name="menus"
              control={control}
              render={({ field }) => (
                <ReactSelect
                  isMulti
                  value={field.value}
                  onChange={field.onChange}
                  options={menus?.data?.map(item => ({
                    label: item.name,
                    value: item.id.toString()
                  }))}
                  placeholder={t('settings:menus.selectMenus')}
                />
              )}
            />
          </div>

          <div>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? t('settings:menus.saving') : t('settings:menus.save')}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}