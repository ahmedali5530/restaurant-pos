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
import {useTranslation} from 'react-i18next';
import {executeSettingsDelete} from "@/lib/settings-delete.service.ts";

export const AdminCoupons = () => {
  const { t } = useTranslation(['admin', 'common', 'toast']);
  const loadHook = useApi<SettingsData<Coupon>>(Tables.coupons, ['deleted_at = none']);
  const db = useDB();

  const [data, setData] = useState<Coupon>();
  const [formModal, setFormModal] = useState(false);

  const columnHelper = createColumnHelper<Coupon>();

  const columns: any = [
    columnHelper.accessor("code", {
      header: t('columns.code'),
    }),
    columnHelper.accessor("description", {
      header: t('columns.description'),
    }),
    columnHelper.accessor("coupon_type", {
      header: "Type",
    }),
    columnHelper.accessor("discount_type", {
      header: t('columns.discountType'),
    }),
    columnHelper.accessor("discount_value", {
      header: t('columns.value'),
    }),
    columnHelper.accessor("min_order_amount", {
      header: t('columns.minOrder'),
    }),
    columnHelper.accessor("max_discount_amount", {
      header: t('columns.maxDiscount'),
    }),
    columnHelper.accessor("usage_limit", {
      header: t('columns.usageLimit'),
    }),
    columnHelper.accessor("usage_limit_per_user", {
      header: t('columns.perUserLimit'),
    }),
    columnHelper.accessor("used_count", {
      header: t('columns.used'),
    }),
    columnHelper.accessor("stackable", {
      header: t('columns.stackable'),
      cell: (info) => (info.getValue() ? "Yes" : "No"),
    }),
    columnHelper.accessor("first_order_only", {
      header: t('columns.firstOrderOnly'),
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
      header: t('columns.actions'),
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
              message={t('delete.coupon', { code: info.row.original.code })}
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
      entityLabel: t('entities.coupon'),
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

