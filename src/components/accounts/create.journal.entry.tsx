import {FC, MutableRefObject, useCallback, useEffect, useMemo, useRef, useState} from "react";
import {Controller, useFieldArray, useForm} from "react-hook-form";
import {DateTime} from "luxon";
import {faPlus, faTrash} from "@fortawesome/free-solid-svg-icons";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {StringRecordId, RecordId} from "surrealdb";
import {useAtom} from "jotai";
import {appPage} from "@/store/jotai.ts";
import {useTranslation} from "react-i18next";
import {toast} from "sonner";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Input} from "@/components/common/input/input.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {Account, NormalBalance} from "@/api/model/account.ts";

interface CreateJournalEntryProps {
  addModal: boolean;
  accounts: Account[];
  onClose?: () => void;
}

interface JournalLineForm {
  account: { label: string; value: string } | null;
  debit: number;
  credit: number;
  description?: string;
}

interface JournalEntryForm {
  date: string;
  memo?: string;
  source_module?: string;
  source_id?: string;
  documents?: any;
  lines: JournalLineForm[];
}

const EMPTY_LINE: JournalLineForm = {account: null, debit: 0, credit: 0, description: ""};

const mergeInputRef = (
  registerRef: (instance: HTMLInputElement | null) => void,
  focusRef: MutableRefObject<(HTMLInputElement | null)[]>,
  index: number
) => (instance: HTMLInputElement | null) => {
  registerRef(instance);
  focusRef.current[index] = instance;
};

export const CreateJournalEntry: FC<CreateJournalEntryProps> = ({addModal, accounts, onClose}) => {
  const {t} = useTranslation('accounts');
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [entryNumber, setEntryNumber] = useState<number | null>(null);
  const [loadingEntryNumber, setLoadingEntryNumber] = useState(false);
  const debitRefs = useRef<(HTMLInputElement | null)[]>([]);
  const creditRefs = useRef<(HTMLInputElement | null)[]>([]);
  const db = useDB();
  const [{user}] = useAtom(appPage);

  const accountById = useMemo(() => {
    const map = new Map<string, Account>();
    accounts.forEach((account) => {
      map.set(account.id.toString(), account);
    });
    return map;
  }, [accounts]);

  const getNormalBalanceForAccount = useCallback((accountId?: string): NormalBalance => {
    if (!accountId) {
      return "debit";
    }
    const account = accountById.get(accountId);
    return account?.normal_balance || account?.group?.normal_balance || "debit";
  }, [accountById]);

  const focusAmountField = useCallback((lineIndex: number, accountId?: string) => {
    if (!accountId) {
      return;
    }
    const normalBalance = getNormalBalanceForAccount(accountId);
    const target = normalBalance === "credit"
      ? creditRefs.current[lineIndex]
      : debitRefs.current[lineIndex];

    requestAnimationFrame(() => {
      target?.focus();
      target?.select();
    });
  }, [getNormalBalanceForAccount]);

  const accountOptions = useMemo(() => {
    return accounts
      .filter((item) => item.is_active)
      .map((item) => ({
        label: `${item.code} - ${item.name}`,
        value: item.id.toString(),
      }));
  }, [accounts]);

  const {register, handleSubmit, control, reset, watch} = useForm<JournalEntryForm>({
    defaultValues: {
      date: DateTime.now().toFormat("yyyy-MM-dd'T'HH:mm"),
      lines: [{...EMPTY_LINE}, {...EMPTY_LINE}],
    }
  });

  const {fields, append, remove} = useFieldArray({
    control,
    name: "lines",
  });

  const fetchNextEntryNumber = useCallback(async () => {
    const [rows] = await db.query(`SELECT math::max(<int>entry_number) as max_value
                                   FROM ${Tables.account_journal_entries}
                                   GROUP ALL`);
    const num = Number(rows?.[0]?.max_value || 0);
    return isFinite(num) ? num + 1 : 1;
  }, []);

  useEffect(() => {
    setModal(addModal);
  }, [addModal]);

  useEffect(() => {
    if (!modal) {
      return;
    }

    let cancelled = false;
    setLoadingEntryNumber(true);

    fetchNextEntryNumber()
      .then((next) => {
        if (!cancelled) {
          setEntryNumber(next);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEntryNumber(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingEntryNumber(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [modal, fetchNextEntryNumber]);

  const watchedLines = watch("lines");
  const debitTotal = (watchedLines || []).reduce((sum, line) => sum + Number(line?.debit || 0), 0);
  const creditTotal = (watchedLines || []).reduce((sum, line) => sum + Number(line?.credit || 0), 0);
  const isBalanced = Number(debitTotal.toFixed(2)) === Number(creditTotal.toFixed(2)) && debitTotal > 0;

  const onModalClose = () => {
    reset({
      date: DateTime.now().toFormat("yyyy-MM-dd'T'HH:mm"),
      memo: "",
      source_module: "",
      source_id: "",
      lines: [{...EMPTY_LINE}, {...EMPTY_LINE}],
    });
    setEntryNumber(null);
    debitRefs.current = [];
    creditRefs.current = [];
    onClose?.();
  };

  const appendEmptyLines = (count: number) => {
    append(Array.from({length: count}, () => ({...EMPTY_LINE})));
  };

  const convertFilesToDocuments = async (files: FileList | null | undefined): Promise<RecordId[]> => {
    if (!files || files.length === 0) return [];

    const documentRefs: RecordId[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const content = await file.arrayBuffer();

      const [created] = await db.create(Tables.documents, {
        name: file.name,
        content,
        size: file.size,
        type: file.type || undefined,
      });

      if (created?.id) {
        documentRefs.push(created.id as RecordId);
      }
    }

    return documentRefs;
  };

  const saveJournalEntry = async (values: JournalEntryForm) => {
    setSaving(true);
    try {
      if (!values.lines || values.lines.length < 2) {
        toast.error(t('messages.needTwoLines'));
        return;
      }

      const validLines = values.lines.filter((line) => line.account?.value && (Number(line.debit) > 0 || Number(line.credit) > 0));
      if (validLines.length < 2) {
        toast.error(t('messages.needValidLines'));
        return;
      }

      const debits = validLines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
      const credits = validLines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
      if (Number(debits.toFixed(2)) !== Number(credits.toFixed(2))) {
        toast.error(t('messages.mustBeBalanced'));
        return;
      }

      const documentRefs = await convertFilesToDocuments(values.documents);
      const resolvedEntryNumber = entryNumber ?? await fetchNextEntryNumber();
      const [entry] = await db.insert(Tables.account_journal_entries, {
        entry_number: resolvedEntryNumber,
        date: DateTime.fromFormat(values.date, "yyyy-MM-dd'T'HH:mm").toJSDate(),
        memo: values.memo || null,
        source_module: values.source_module || null,
        source_id: values.source_id || null,
        documents: documentRefs.length > 0 ? documentRefs : undefined,
        created_by: user?.id ? new StringRecordId(user.id.toString()) : null,
        status: "posted",
      });

      const lineIds: any[] = [];
      for (const line of validLines) {
        const [createdLine] = await db.insert(Tables.account_journal_lines, {
          entry: new StringRecordId(entry.id.toString()),
          account: new StringRecordId(line.account!.value),
          debit: Number(line.debit || 0),
          credit: Number(line.credit || 0),
          description: line.description || null,
        });
        lineIds.push(createdLine.id);
      }

      await db.merge(new StringRecordId(entry.id.toString()), {
        lines: lineIds,
      });

      onModalClose();
    } catch (error: any) {
      toast.error(error?.message || t('messages.saveJournalFailed'));
      throw error;
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={modal}
      onClose={onModalClose}
      size="full"
      title={t('forms.createJournalEntry')}
    >
      <form onSubmit={handleSubmit(saveJournalEntry)}>
        <div className="grid grid-cols-5 gap-4">
          <div>
            <Input
              id="entry_number"
              type="text"
              className="w-full"
              label={t('columns.entryNumber')}
              value={loadingEntryNumber ? t('actions.loading') : entryNumber?.toString() ?? "-"}
              readOnly
              disabled
            />
          </div>
          <div>
            <Input {...register("date")} id="entry_date" type="datetime-local" className="w-full" label={t('columns.date')}/>
          </div>
          <div>
            <Input {...register("source_module")} id="entry_source_module" className="w-full"
                   label={t('columns.module')} placeholder="sales, expenses..."/>
          </div>
          <div>
            <Input {...register("source_id")} id="entry_source_id" className="w-full"
                   label={t('columns.sourceId')} placeholder="optional external reference"/>
          </div>
          <div>
            <Input {...register("memo")} id="entry_memo" className="w-full" label={t('columns.memo')} placeholder="entry memo"/>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-4 mt-4">
          <div className="col-span-2">
            <label className="block mb-2 text-sm font-medium text-gray-900">{t('upload.attachDocuments', 'Attach Documents')}</label>
            <input
              type="file"
              multiple
              {...register("documents")}
              className="w-full px-3 py-2 border border-neutral-400 rounded-lg text-sm"
            />
          </div>
        </div>

        <div className="mt-6 bg-white border rounded-lg">
          <div className="grid grid-cols-12 gap-3 p-3 border-b font-semibold text-gray-600">
            <div className="col-span-4">{t('reports.account')}</div>
            <div className="col-span-2">{t('columns.debit')}</div>
            <div className="col-span-2">{t('columns.credit')}</div>
            <div className="col-span-3">{t('reports.description')}</div>
            <div className="col-span-1 text-right">{t('columns.actions')}</div>
          </div>

          <div className="p-3 space-y-3">
            {fields.map((field, index) => {
              const debitField = register(`lines.${index}.debit` as const);
              const creditField = register(`lines.${index}.credit` as const);

              return (
              <div className="grid grid-cols-12 gap-3" key={field.id}>
                <div className="col-span-4">
                  <Controller
                    control={control}
                    name={`lines.${index}.account`}
                    render={({field: accountField}) => (
                      <ReactSelect
                        {...accountField}
                        options={accountOptions}
                        placeholder={t('reports.account')}
                        onChange={(option) => {
                          accountField.onChange(option);
                          focusAmountField(index, option?.value);
                        }}
                      />
                    )}
                  />
                </div>
                <div className="col-span-2">
                  <Input
                    type="number"
                    className="w-full"
                    {...debitField}
                    ref={mergeInputRef(debitField.ref, debitRefs, index)}
                  />
                </div>
                <div className="col-span-2">
                  <Input
                    type="number"
                    className="w-full"
                    {...creditField}
                    ref={mergeInputRef(creditField.ref, creditRefs, index)}
                  />
                </div>
                <div className="col-span-3">
                  <Input
                    className="w-full"
                    {...register(`lines.${index}.description` as const)}
                  />
                </div>
                <div className="col-span-1 text-right">
                  <Button
                    type="button"
                    variant="danger"
                    className="w-[40px]"
                    onClick={() => remove(index)}
                    disabled={fields.length <= 2}
                  >
                    <FontAwesomeIcon icon={faTrash}/>
                  </Button>
                </div>
              </div>
              );
            })}
          </div>

          <div className="p-3 border-t flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => append({...EMPTY_LINE})}
            >
              <FontAwesomeIcon icon={faPlus} className="mr-2"/> Add line
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => appendEmptyLines(10)}
            >
              <FontAwesomeIcon icon={faPlus} className="mr-2"/> Add 10 lines
            </Button>
          </div>
        </div>

        <div className="mt-5 p-4 bg-gray-100 rounded-lg flex justify-between items-center">
          <div className="text-sm">
            <span className="mr-4">{t('reports.debitTotal')}: <strong>{debitTotal.toFixed(2)}</strong></span>
            <span>{t('reports.creditTotal')}: <strong>{creditTotal.toFixed(2)}</strong></span>
            <span className={`ml-4 font-semibold ${isBalanced ? "text-success-600" : "text-danger-600"}`}>
              {isBalanced ? t('reports.balanced') : t('reports.notBalanced')}
            </span>
          </div>
          <Button variant="primary" type="submit" disabled={saving || !isBalanced || loadingEntryNumber || entryNumber == null}>
            {saving ? t('forms.saving') : t('forms.postJournalEntry')}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
