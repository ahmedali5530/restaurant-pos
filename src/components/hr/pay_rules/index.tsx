import {useState} from "react";
import {useTranslation} from "react-i18next";
import {createColumnHelper} from "@tanstack/react-table";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {LaborPayRule} from "@/api/model/labor_pay_rule.ts";
import {TableComponent} from "@/components/common/table/table.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {IconTooltipButton} from "@/components/common/input/icon.tooltip.button.tsx";
import {faPencil, faPlus} from "@fortawesome/free-solid-svg-icons";
import {PayRuleForm} from "@/components/hr/pay_rules/form.tsx";
import {enumLocaleKey} from "@/components/hr/shared/form.utils.ts";

export const HrPayRules = () => {
  const {t} = useTranslation("hr");
  const loadHook = useApi<SettingsData<LaborPayRule>>(Tables.labor_pay_rules, [], [], 0, 10, []);

  const [data, setData] = useState<LaborPayRule>();
  const [formModal, setFormModal] = useState(false);

  const columnHelper = createColumnHelper<LaborPayRule>();

  const columns: any = [
    columnHelper.accessor("code", {header: t("columns.code")}),
    columnHelper.accessor("name", {header: t("columns.name")}),
    columnHelper.accessor("priority", {header: t("columns.priority")}),
    columnHelper.accessor((row) => row.effects?.length ?? 0, {
      id: "effects",
      header: t("forms.payRule.effects"),
      cell: (info) => {
        const count = info.getValue() as number;
        const first = info.row.original.effects?.[0];
        if (!count) return "—";
        const typeLabel = first
          ? t(`effectTypes.${enumLocaleKey(first.type)}`, {defaultValue: first.type})
          : "";
        return count === 1 ? typeLabel : `${count} · ${typeLabel}`;
      },
    }),
    columnHelper.accessor("stacking_mode", {header: t("columns.stackingMode")}),
    columnHelper.accessor("exclusive", {
      header: t("columns.exclusive"),
      cell: (info) => (info.getValue() ? t("buttons.yes", {defaultValue: "Yes"}) : "No"),
    }),
    columnHelper.accessor("is_active", {
      header: t("columns.isActive"),
      cell: (info) => (info.getValue() !== false ? t("status.employment.active") : t("status.employment.inactive")),
    }),
    columnHelper.accessor("id", {
      id: "actions",
      header: t("columns.actions"),
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => (
        <IconTooltipButton
          label={t("buttons.edit")}
          variant="primary"
          icon={faPencil}
          onClick={() => { setData(info.row.original); setFormModal(true); }}
        />
      ),
    }),
  ];

  return (
    <>
      <TableComponent
        columns={columns}
        loaderHook={loadHook}
        loaderLineItems={columns.length}
        buttons={[
          <Button key="pay-rule-create" variant="primary" data-testid="hr-add-pay-rules" onClick={() => { setData(undefined); setFormModal(true); }} icon={faPlus}>
            {t("buttons.payRule")}
          </Button>,
        ]}
      />
      {formModal && (
        <PayRuleForm
          open
          data={data}
          onClose={() => {
            setFormModal(false);
            setData(undefined);
            loadHook.fetchData();
          }}
        />
      )}
    </>
  );
};
