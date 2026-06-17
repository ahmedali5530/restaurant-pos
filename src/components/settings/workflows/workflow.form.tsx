import { Workflow } from "@/api/model/workflow.ts";
import { Kitchen } from "@/api/model/kitchen.ts";
import { Modal } from "@/components/common/react-aria/modal.tsx";
import { Input, InputError } from "@/components/common/input/input.tsx";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { Button } from "@/components/common/input/button.tsx";
import { useEffect } from "react";
import { useDB } from "@/api/db/db.ts";
import { zodResolver } from "@hookform/resolvers/zod";
import { Tables } from "@/api/db/tables.ts";
import { toast } from "sonner";
import {useTranslation} from 'react-i18next';
import i18n from '@/lib/i18n.ts';
import * as z from "zod";
import { ReactSelect } from "@/components/common/input/custom.react.select.tsx";
import useApi, { SettingsData } from "@/api/db/use.api.ts";
import { StringRecordId } from "surrealdb";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowDown, faArrowUp, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import _ from "lodash";

interface Props {
  open: boolean
  onClose: () => void;
  data?: Workflow
}

const validationSchema = z.object({
  name: z.string().min(1, i18n.t('validation:required')),
  stages: z.array(z.object({
    name: z.string().min(1, i18n.t('forms.stageNameRequired')),
    kitchen: z.object({
      label: z.string(),
      value: z.string()
    }).nullable().refine((value) => !!value?.value, { message: i18n.t('forms.kitchenRequired') })
  })).min(1, i18n.t('forms.addAtLeastOneStage')),
});

export const WorkflowForm = ({
  open, onClose, data
}: Props) => {
  const { t } = useTranslation(['admin', 'common', 'validation', 'toast']);

  const db = useDB();

  const {
    data: kitchens,
    fetchData: fetchKitchens
  } = useApi<SettingsData<Kitchen>>(Tables.kitchens, ['deleted_at = none'], ['priority asc'], 0, 99999, [], {
    enabled: false
  });

  const { register, control, handleSubmit, formState: { errors }, reset } = useForm({
    resolver: zodResolver(validationSchema),
    defaultValues: {
      name: '',
      stages: []
    }
  });

  const { fields, append, remove, move } = useFieldArray({
    name: 'stages',
    control
  });

  const closeModal = () => {
    onClose();
    reset({ name: '', stages: [] });
  }

  useEffect(() => {
    if (open) {
      fetchKitchens();
    }
  }, [open]);

  useEffect(() => {
    if (data?.id) {
      loadStages(data.id);
    }
  }, [data]);

  const loadStages = async (workflowId: string) => {
    const [stages]: any = await db.query(
      `SELECT * FROM ${Tables.workflow_stages} WHERE workflow = $wf ORDER BY sequence ASC FETCH kitchen`,
      { wf: new StringRecordId(workflowId.toString()) }
    );

    reset({
      name: data?.name ?? '',
      stages: (stages ?? []).map((stage: any) => ({
        name: stage.name,
        kitchen: stage.kitchen ? {
          label: stage.kitchen.name,
          value: stage.kitchen.id.toString()
        } : null
      }))
    });
  }

  const onSubmit = async (values: any) => {
    try {
      let workflowId: any;
      if (data?.id) {
        workflowId = data.id;
        await db.merge(data.id, { name: values.name });
      } else {
        const [record] = await db.create(Tables.workflows, { name: values.name });
        workflowId = record.id;
      }

      // Replace stages: delete then recreate with fresh sequence ordering.
      await db.query(`DELETE ${Tables.workflow_stages} WHERE workflow = $wf`, {
        wf: new StringRecordId(workflowId.toString())
      });

      const lastIndex = values.stages.length - 1;
      for (let i = 0; i < values.stages.length; i++) {
        const stage = values.stages[i];
        await db.create(Tables.workflow_stages, {
          workflow: new StringRecordId(workflowId.toString()),
          kitchen: new StringRecordId(stage.kitchen.value.toString()),
          name: stage.name,
          sequence: i + 1,
          is_terminal: i === lastIndex
        });
      }

      closeModal();
      toast.success(t('toast:admin.workflowSaved', { name: values.name }));
    } catch (e) {
      toast.error(e);
      console.log(e);
    }
  }

  const kitchenOptions = kitchens?.data?.map(item => ({
    label: item.name,
    value: item.id.toString()
  }));

  return (
    <Modal
      title={data ? t('forms.updateWorkflow', { name: data?.name }) : t('forms.createWorkflow')}
      open={open}
      onClose={closeModal}
      size="md"
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="flex gap-3 mb-3 flex-col">
          <div className="flex-1">
            <Input label={t('columns.name')} {...register('name')} autoFocus error={errors?.name?.message}/>
          </div>

          <div className="flex-1">
            <fieldset className="border-2 border-neutral-900 rounded-lg p-3">
              <legend>Production stages (in order)</legend>
              <div className="mb-3">
                <Button type="button" icon={faPlus} variant="primary" onClick={() => {
                  append({ name: '', kitchen: null });
                }}>
                  Add stage
                </Button>
              </div>

              {fields.map((item, index) => (
                <div className="flex gap-3 mb-3 items-end" key={item.id}>
                  <div className="flex-0 self-center text-neutral-500 font-bold w-6 text-center">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <Controller
                      name={`stages.${index}.name`}
                      control={control}
                      render={({ field }) => (
                        <Input
                          label={t('forms.stageName')}
                          value={field.value ?? ''}
                          onChange={field.onChange}
                          error={_.get(errors, ['stages', index, 'name', 'message'])}
                        />
                      )}
                    />
                  </div>
                  <div className="flex-1">
                    <label>Kitchen / Station</label>
                    <Controller
                      name={`stages.${index}.kitchen`}
                      control={control}
                      render={({ field }) => (
                        <ReactSelect
                          value={field.value}
                          onChange={field.onChange}
                          options={kitchenOptions}
                        />
                      )}
                    />
                    <InputError error={_.get(errors, ['stages', index, 'kitchen', 'message'])}/>
                  </div>
                  <div className="flex-0 flex gap-1">
                    <Button iconButton variant="secondary" type="button" isDisabled={index === 0}
                            onClick={() => move(index, index - 1)}>
                      <FontAwesomeIcon icon={faArrowUp}/>
                    </Button>
                    <Button iconButton variant="secondary" type="button" isDisabled={index === fields.length - 1}
                            onClick={() => move(index, index + 1)}>
                      <FontAwesomeIcon icon={faArrowDown}/>
                    </Button>
                    <Button iconButton variant="danger" type="button" onClick={() => remove(index)}>
                      <FontAwesomeIcon icon={faTrash}/>
                    </Button>
                  </div>
                </div>
              ))}
              {typeof errors?.stages?.message === 'string' && (
                <InputError error={errors.stages.message}/>
              )}
            </fieldset>
          </div>
        </div>
        <div>
          <Button type="submit" variant="primary">{t('common:actions.save')}</Button>
        </div>
      </form>
    </Modal>
  )
}
