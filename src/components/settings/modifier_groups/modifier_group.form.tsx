import { Modal } from "@/components/common/react-aria/modal.tsx";
import { Input } from "@/components/common/input/input.tsx";
import { Button } from "@/components/common/input/button.tsx";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import { toast } from 'sonner';
import {useTranslation} from 'react-i18next';
import i18n from '@/lib/i18n.ts';
import * as yup from "yup";
import { yupResolver } from "@hookform/resolvers/yup";
import {useCallback, useEffect, useMemo, useState} from "react";
import { ModifierGroup } from "@/api/model/modifier_group.ts";
import useApi, { SettingsData } from "@/api/db/use.api.ts";
import { ReactSelect } from "@/components/common/input/custom.react.select.tsx";
import { Dish } from "@/api/model/dish.ts";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPencil, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { DishForm } from "@/components/settings/dishes/dish.form.tsx";
import {toRecordId} from "@/lib/utils.ts";
import { Switch } from "@/components/common/input/switch.tsx";
import { DishModifierGroup } from "@/api/model/dish_modifier_group.ts";
import {
  fetchAttachableGroupsForDish,
  fetchModifierGroupTemplate,
  mergeNextGroupOverrides,
  normalizeNextGroupOverrides,
} from "@/lib/modifier-groups.ts";
import { NestedGroupOverrideEditor } from "@/components/settings/modifier_groups/nested-group-override-editor.tsx";
import {
  ModifierNextGroupOverride,
  ModifierNextGroupOverrideItem,
} from "@/api/model/modifier.ts";

interface Props {
  open: boolean
  onClose: () => void;
  data?: ModifierGroup
}

const validationSchema = yup.object({
  name: yup.string().required(i18n.t('validation:required')),
  priority: yup.string().required(i18n.t('validation:required')),
  modifiers: yup.array(yup.object({
    modifier: yup.object({
      label: yup.string(),
      value: yup.string()
    }).default(undefined).required(i18n.t('validation:required')),
    price: yup.number().required(i18n.t('validation:required')),
    allowed_next_groups: yup.array(yup.string()).default([]),
    next_group_overrides: yup.array(yup.object({
      group_id: yup.string().required(),
      items: yup.array(yup.object({
        nested_modifier_id: yup.string().required(),
        price: yup.number().required(),
        hidden: yup.boolean().default(false),
      })).default([])
    })).default([])
  })).min(1, i18n.t('validation:required'))
});

const ModifierNextGroups = ({
  index,
  control,
  setValue,
  db,
}: {
  index: number
  control: ReturnType<typeof useForm>['control']
  setValue: ReturnType<typeof useForm>['setValue']
  db: ReturnType<typeof useDB>
}) => {
  const { t } = useTranslation(['admin', 'common', 'validation', 'toast']);
  const modifier = useWatch({ control, name: `modifiers.${index}.modifier` });
  const allowedNextGroups: string[] = useWatch({ control, name: `modifiers.${index}.allowed_next_groups` }) ?? [];
  const nextGroupOverrides: ModifierNextGroupOverride[] = useWatch({
    control,
    name: `modifiers.${index}.next_group_overrides`,
  }) ?? [];
  const [attachableGroups, setAttachableGroups] = useState<DishModifierGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingGroup, setEditingGroup] = useState<{
    groupId: string
    groupName: string
    template: ModifierGroup | null
    items: ModifierNextGroupOverrideItem[]
  } | null>(null);

  useEffect(() => {
    if (!modifier?.value) {
      setAttachableGroups([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchAttachableGroupsForDish(db, modifier.value)
      .then((rows) => {
        if (!cancelled) {
          setAttachableGroups(rows);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [modifier?.value]);

  const isGroupModified = useCallback((groupId) => {
    return nextGroupOverrides.filter(item => {
      if(item.group_id === groupId){
        return item.items.filter(a => a.hidden).length > 0
      }

      return false;
    }).length > 0;
  }, [nextGroupOverrides]);

  if (!modifier?.value) {
    return null;
  }

  if (loading) {
    return (
      <p className="text-sm text-neutral-500 col-span-full">
        {t('forms.loadingModifierGroups')}
      </p>
    );
  }

  if (attachableGroups.length === 0) {
    return (
      <p className="text-sm text-neutral-500 col-span-full">
        {t('forms.attachModifierGroupsFirst')}
      </p>
    );
  }

  const openCustomize = async (groupId: string, groupName: string) => {
    const template = await fetchModifierGroupTemplate(db, groupId);
    const existing = normalizeNextGroupOverrides(nextGroupOverrides).find(
      (row) => row.group_id === groupId
    );

    setEditingGroup({
      groupId,
      groupName,
      template,
      items: existing?.items ?? [],
    });
  };

  return (
    <>
      <div className="col-span-full">
        <label className="text-sm font-medium">{t('forms.nextModifierGroups')}</label>
        <div className="flex flex-col gap-2">
          {attachableGroups.map((row) => {
            const groupId = row.out.id.toString();
            const checked = allowedNextGroups.includes(groupId);

            return (
              <div key={groupId} className="flex flex-wrap items-center gap-3">
                <Switch
                  checked={checked}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...allowedNextGroups, groupId]
                      : allowedNextGroups.filter((id) => id !== groupId);
                    setValue(`modifiers.${index}.allowed_next_groups`, next, {
                      shouldDirty: true,
                    });

                    if (!e.target.checked) {
                      const filtered = normalizeNextGroupOverrides(
                        nextGroupOverrides
                      ).filter((entry) => entry.group_id !== groupId);
                      setValue(`modifiers.${index}.next_group_overrides`, filtered, {
                        shouldDirty: true,
                      });
                    }
                  }}
                >
                  {row.out.name}
                </Switch>
                {checked && (
                  <Button
                    type="button"
                    variant={isGroupModified(groupId) ? 'warning' : 'secondary'}
                    filled
                    flat
                    onClick={() => openCustomize(groupId, row.out.name)}
                    icon={faPencil}
                    iconButton
                  >
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {editingGroup && (
        <NestedGroupOverrideEditor
          open={Boolean(editingGroup)}
          groupId={editingGroup.groupId}
          groupName={editingGroup.groupName}
          title={`${modifier.label} — ${editingGroup.groupName}`}
          template={editingGroup.template}
          items={editingGroup.items}
          onClose={() => setEditingGroup(null)}
          onSave={(items) => {
            const merged = mergeNextGroupOverrides(
              nextGroupOverrides,
              editingGroup.groupId,
              items
            );
            setValue(`modifiers.${index}.next_group_overrides`, merged, {
              shouldDirty: true,
            });
            setEditingGroup(null);
          }}
        />
      )}
    </>
  );
};

export const ModifierGroupForm = ({ open, onClose, data }: Props) => {
  const { t } = useTranslation(['admin', 'common', 'validation', 'toast']);
  const closeModal = () => {
    onClose();
  }

  const db = useDB();

  const { register, control, handleSubmit, formState: { errors }, reset, setValue } = useForm({
    resolver: yupResolver(validationSchema),
    defaultValues: {
      modifiers: []
    }
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    if (!data) {
      reset({
        name: '',
        priority: '0',
        modifiers: []
      });
      return;
    }

    let cancelled = false;

    const loadForm = async () => {
      const modifiers = await Promise.all(
        data.modifiers.map(async (item) => {
          const dishId = toRecordId(item.modifier.id).toString();
          const attachable = await fetchAttachableGroupsForDish(db, dishId);
          const attachableIds = attachable.map((g) => g.out.id.toString());
          const savedIds = item.allowed_next_groups?.map((g) => toRecordId(g.id).toString());

          return {
            modifier: {
              label: `${item.modifier.number}-${item.modifier.name}`,
              value: dishId
            },
            id: item.id.toString(),
            price: item.price,
            allowed_next_groups: savedIds ?? attachableIds,
            next_group_overrides: normalizeNextGroupOverrides(item.next_group_overrides),
          };
        })
      );

      if (!cancelled) {
        reset({
          name: data.name,
          priority: data.priority.toString(),
          modifiers,
        });
      }
    };

    loadForm();

    return () => {
      cancelled = true;
    };
  }, [data, open, reset]);

  useEffect(() => {
    if (open) {
      fetchDishes();
    }
  }, [open]);

  const {
    fields, append, remove
  } = useFieldArray({
    name: 'modifiers',
    control: control
  });

  const {
    data: dishes,
    isFetching: loadingDishes,
    fetchData: fetchDishes
  } = useApi<SettingsData<Dish>>(Tables.dishes, [], ['priority asc'], 0, 99999, [], {
    'enabled': false
  });

  const onSubmit = async (values: any) => {
    const vals = { ...values };

    vals.priority = Number(vals.priority);
    const modifiers = [];
    if (vals.modifiers) {
      for (const m of vals.modifiers) {
        const allowedNextGroups = (m.allowed_next_groups ?? []).map((id: string) => toRecordId(id));

        if (m?.id) {
          await db.merge(toRecordId(m.id), {
            modifier: toRecordId(m.modifier.value),
            price: Number(m.price),
            allowed_next_groups: allowedNextGroups,
            next_group_overrides: normalizeNextGroupOverrides(m.next_group_overrides),
          });

          modifiers.push(toRecordId(m.id));
        } else {
          const [record] = await db.create(Tables.modifiers, {
            modifier: toRecordId(m.modifier.value),
            price: m.price,
            allowed_next_groups: allowedNextGroups,
            next_group_overrides: normalizeNextGroupOverrides(m.next_group_overrides),
          });

          modifiers.push(record.id);
        }
      }

      vals.modifiers = modifiers;
    }

    try {
      if (data?.id) {
        await db.merge(toRecordId(data.id), {
          ...vals
        })
      } else {
        await db.create(Tables.modifier_groups, {
          ...vals
        });
      }

      closeModal();
      toast.success(t('toast:admin.modifierGroupSaved', { name: values.name }));
    } catch (e) {
      toast.error(e);
      console.log(e)
    }
  }

  const [dishModal, setDishModal] = useState(false);

  return (
    <>
      <Modal
        title={data ? t('forms.updateModifierGroup', { name: data?.name }) : t('forms.createModifierGroup')}
        open={open}
        onClose={closeModal}
        size="lg"
      >
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="mb-3 flex gap-3">
            <div>
              <Input label={t('columns.name')} {...register('name')} autoFocus error={errors?.name?.message}/>
            </div>
            <div>
              <Controller
                render={({ field }) => (
                  <Input
                    type="number"
                    label={t('columns.priority')}
                    error={errors?.priority?.message}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
                name="priority"
                control={control}
              />
            </div>
          </div>

          <div className="mb-3">
            <fieldset className="border-2 border-neutral-900 rounded-lg p-3">
              <legend>Modifiers</legend>

              <div className="flex gap-3 mb-3">
                <Button onClick={() => {
                  append({
                    modifier: null,
                    price: 0,
                    allowed_next_groups: [],
                    next_group_overrides: [],
                  })
                }} variant="primary" type="button" icon={faPlus}>modifier</Button>

                <Button onClick={() => {
                  setDishModal(true)
                }} variant="primary" type="button" icon={faPlus} flat>New modifier</Button>
              </div>

              {fields.map((item, index) => (
                <div className="flex flex-wrap gap-3 mb-3 pb-3 border-b border-neutral-100 last:border-0" key={item.id}>
                  <div className="shrink grow-0 min-w-[250px]">
                    <label htmlFor="modifier">Modifier</label>
                    <Controller
                      control={control}
                      name={`modifiers.${index}.modifier`}
                      render={({ field }) => (
                        <ReactSelect
                          value={field.value}
                          onChange={async (val) => {
                            field.onChange(val);
                            if (val?.value) {
                              const attachable = await fetchAttachableGroupsForDish(db, val.value);
                              setValue(
                                `modifiers.${index}.allowed_next_groups`,
                                attachable.map((g) => g.out.id.toString()),
                                { shouldDirty: true }
                              );
                              setValue(`modifiers.${index}.next_group_overrides`, [], {
                                shouldDirty: true,
                              });
                            } else {
                              setValue(`modifiers.${index}.allowed_next_groups`, [], { shouldDirty: true });
                              setValue(`modifiers.${index}.next_group_overrides`, [], { shouldDirty: true });
                            }
                          }}
                          options={dishes?.data?.map((dish) => ({
                            label: `${dish.number}-${dish.name}`,
                            value: dish.id.toString()
                          }))}
                          isLoading={loadingDishes}
                        />
                      )}
                    />
                  </div>
                  <div className="grow-0 shrink min-w-[120px]">
                    <Controller
                      control={control}
                      name={`modifiers.${index}.price`}
                      render={({ field }) => (
                        <Input
                          type="number"
                          label={t('common:actions.price')}
                          value={field.value}
                          onChange={field.onChange}
                        />
                      )}
                    />
                  </div>
                  <div className="self-start flex flex-col">
                    <label htmlFor="">&nbsp;</label>
                    <Button iconButton variant="danger" type="button" onClick={() => remove(index)}>
                      <FontAwesomeIcon icon={faTrash} />
                    </Button>
                  </div>
                  <ModifierNextGroups
                    index={index}
                    control={control}
                    setValue={setValue}
                    db={db}
                  />
                </div>
              ))}
            </fieldset>
          </div>

          <div>
            <Button type="submit" variant="primary">{t('common:actions.save')}</Button>
          </div>
        </form>
      </Modal>

      {dishModal && (
        <DishForm
          open={dishModal}
          onClose={() => {
            setDishModal(false);
            fetchDishes();
          }}
        />
      )}
    </>
  )
}
