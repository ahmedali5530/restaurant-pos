import {useState} from "react";
import {useTranslation} from "react-i18next";
import {createColumnHelper} from "@tanstack/react-table";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {LaborPayRule} from "@/api/model/labor_pay_rule.ts";
import {TableComponent} from "@/components/common/table/table.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faPencil, faPlus} from "@fortawesome/free-solid-svg-icons";
import {PayRuleForm} from "@/components/hr/pay_rules/form.tsx";

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
        <Button variant="primary" onClick={() => { setData(info.row.original); setFormModal(true); }}>
          <FontAwesomeIcon icon={faPencil}/>
        </Button>
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
          <Button key="pay-rule-create" variant="primary" onClick={() => { setData(undefined); setFormModal(true); }} icon={faPlus}>
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
