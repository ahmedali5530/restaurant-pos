import { useState } from "react";
import { Tables } from "@/api/db/tables.ts";
import useApi, { SettingsData } from "@/api/db/use.api.ts";
import { createColumnHelper } from "@tanstack/react-table";
import { Button } from "@/components/common/input/button.tsx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPencil, faPlus } from "@fortawesome/free-solid-svg-icons";
import { TableComponent } from "@/components/common/table/table.tsx";
import { Coupon } from "@/api/model/coupon.ts";
import { CouponForm } from "@/components/settings/coupons/coupon.form.tsx";
import {DeleteConfirm} from "@/components/common/table/delete.confirm.tsx";
import {useDB} from "@/api/db/db.ts";
import {executeSettingsDelete} from "@/lib/settings-delete.service.ts";

export const AdminCoupons = () => {
  const loadHook = useApi<SettingsData<Coupon>>(Tables.coupons, ['deleted_at = none']);
  const db = useDB();

  const [data, setData] = useState<Coupon>();
  const [formModal, setFormModal] = useState(false);

  const columnHelper = createColumnHelper<Coupon>();

  const columns: any = [
    columnHelper.accessor("code", {
      header: "Code",
    }),
    columnHelper.accessor("description", {
      header: "Description",
    }),
    columnHelper.accessor("coupon_type", {
      header: "Type",
    }),
    columnHelper.accessor("discount_type", {
      header: "Discount type",
    }),
    columnHelper.accessor("discount_value", {
      header: "Value",
    }),
    columnHelper.accessor("min_order_amount", {
      header: "Min order",
    }),
    columnHelper.accessor("max_discount_amount", {
      header: "Max discount",
    }),
    columnHelper.accessor("usage_limit", {
      header: "Usage limit",
    }),
    columnHelper.accessor("usage_limit_per_user", {
      header: "Per user limit",
    }),
    columnHelper.accessor("used_count", {
      header: "Used",
    }),
    columnHelper.accessor("stackable", {
      header: "Stackable",
      cell: (info) => (info.getValue() ? "Yes" : "No"),
    }),
    columnHelper.accessor("first_order_only", {
      header: "First order only",
      cell: (info) => (info.getValue() ? "Yes" : "No"),
    }),
    columnHelper.accessor("priority", {
      header: "Priority",
    }),
    columnHelper.accessor("is_active", {
      header: "Active",
      cell: (info) => (info.getValue() ? "Yes" : "No"),
    }),
    columnHelper.accessor("id", {
      id: "actions",
      header: "Actions",
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => {
        return (
          <div className="flex gap-3 items-center">
            <Button
              variant="primary"
              onClick={() => {
                setData(info.row.original);
                setFormModal(true);
              }}
            >
              <FontAwesomeIcon icon={faPencil} />
            </Button>
            <div className="separator"></div>
            <DeleteConfirm
              message={`Delete coupon ${info.row.original.code}`}
              onConfirm={() => deleteItem(info.row.original.id)}
            />
          </div>
        );
      },
    }),
  ];

  const deleteItem = async (id: string) => {
    await executeSettingsDelete({
      db,
      id,
      entityLabel: 'Coupon',
      usageChecks: [
        {
          query: `SELECT count() AS count FROM ${Tables.order_coupons} WHERE coupon = $idRecord GROUP ALL`
        },
        {
          query: `SELECT count() AS count FROM ${Tables.coupon_redemptions} WHERE coupon = $idRecord GROUP ALL`
        }
      ],
      onAfter: async () => {
        loadHook.fetchData();
      }
    });
  };

  return (
    <>
      <TableComponent
        columns={columns}
        loaderHook={loadHook}
        loaderLineItems={columns.length}
        buttons={[
          <Button
            variant="primary"
            onClick={() => {
              setFormModal(true);
            }}
            icon={faPlus}
            key="new-coupon"
          >
            Coupon
          </Button>,
        ]}
      />

      {formModal && (
        <CouponForm
          open={formModal}
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

