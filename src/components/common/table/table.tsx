import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  RowSelectionState,
  Updater,
  PaginationState,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import React, {FC, ReactNode, useEffect, useState,} from "react";
import { useTranslation } from "react-i18next";
import _ from "lodash";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClose, faRefresh, faSearch, } from "@fortawesome/free-solid-svg-icons";
import { Input } from "@/components/common/input/input.tsx";
import { Controller, useForm } from "react-hook-form";
import classNames from "classnames";
import { ReactSelect } from "@/components/common/input/custom.react.select.tsx";
import { Loader } from "@/components/common/loader/loader.tsx";
import { UseApiResult } from "@/api/db/use.api.ts";
import {LabelValue} from "@/api/model/common.ts";

interface ButtonProps {
  title?: ReactNode;
  html: ReactNode;
}

interface DropdownFilter {
  name: string
  options: LabelValue[]
}

interface TableComponentProps {
  columns: any;
  defaultSort?: SortingState;

  buttons?: ReactNode[];
  dropdownFilters?: DropdownFilter[]

  enableSearch?: boolean;
  enableRefresh?: boolean

  enableSelection?: boolean
  selectionButtons?: ReactNode[];
  rowSelection?: RowSelectionState
  onRowSelectionChange?: (state: RowSelectionState, selectedRows: any[]) => void

  loaderHook: UseApiResult;

  loaderLines?: number
  loaderLineItems?: number

  customSearch?: boolean
  customSearchHandler?: (value?: string) => void
}

export const TableComponent: FC<TableComponentProps> = ({
  columns,
  buttons, dropdownFilters,
  enableSearch,
  loaderHook,
  loaderLines, loaderLineItems, enableRefresh = true,
  enableSelection, selectionButtons, rowSelection: controlledRowSelection, onRowSelectionChange,
  customSearchHandler,
  customSearch = false,
  defaultSort = []
}) => {
  const { t } = useTranslation();

  const [sorting, setSorting] = useState<SortingState>(defaultSort);
  useEffect(() => {
    if( sorting.length === 1 && sorting[0]?.id !== '' ) {
      handleSortChange!([`${sorting[0].id} ${sorting[0].desc === true ? 'DESC' : 'ASC'}`]);
    } else {
      handleSortChange!([]);
    }
  }, [sorting]);

  const [{ pageIndex, pageSize }, setPagination] =
    React.useState<PaginationState>({
      pageIndex: 0,
      pageSize: 10,
    });

  useEffect(() => {
    handlePageChange!(pageIndex * pageSize);
    handleLimitChange!(pageSize);
  }, [pageIndex, pageSize]);

  const pagination = React.useMemo(
    () => ({
      pageIndex,
      pageSize,
    }),
    [pageIndex, pageSize]
  );

  const {
    data,
    handlePageChange,
    handleFilterChange,
    handleParameterChange,
    filters,
    handlePageSizeChange: handleLimitChange,
    handleSortChange,
    fetchData,
    resetFilters,
    isLoading
  } = loaderHook;

  const total = data?.total || 0;

  const [internalRowSelection, setInternalRowSelection] = useState<RowSelectionState>({});
  const rowSelection = controlledRowSelection ?? internalRowSelection;
  const tableData = data?.data || [];

  const getSelectionRowId = (originalRow: any, index: number) =>
    originalRow?.id ?? originalRow?.uuid ?? `${index}`;

  const handleSelectionStateChange = (updater: Updater<RowSelectionState>) => {
    const nextState =
      typeof updater === "function" ? updater(rowSelection) : updater;

    if (controlledRowSelection === undefined) {
      setInternalRowSelection(nextState);
    }

    if (!onRowSelectionChange) {
      return;
    }

    const selectedRows = tableData.filter((row: any, index: number) => {
      const rowId = getSelectionRowId(row, index);
      return nextState[rowId] === true;
    });

    onRowSelectionChange(nextState, selectedRows);
  };

  const table = useReactTable({
    data: tableData,
    pageCount: Math.ceil(total / pageSize), // total pages
    columns,
    getCoreRowModel: getCoreRowModel(),
    state: {
      sorting,
      pagination,
      rowSelection
    },
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    onRowSelectionChange: handleSelectionStateChange,
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    manualPagination: true,
    enableMultiSort: false,
    manualSorting: true,
    manualFiltering: true,
    enableRowSelection: enableSelection,
    getRowId: getSelectionRowId,
  });

  const pageSizes: { [key: string | number]: any } = {
    10: 10,
    20: 20,
    25: 25,
    50: 50,
    100: 100,
    500: 500
  };

  const {
    handleSubmit,
    control,
    setValue
  } = useForm();

  const filterOptions = table
    .getAllColumns()
    .filter((column) => column.getCanFilter())
    .map((column) => ({ label: column.columnDef.header, value: column.id }));

  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if( !loaded ) {
      setValue("column", filterOptions[0]); // set first column as default
      setLoaded(true);
    }
  }, [table.getAllColumns()]);

  const handleColumnFilter = (values: any) => {
    if( values.value && values.value.trim() !== '' ) {
      handleFilterChange([
        `string::similarity::fuzzy(string::lowercase($this[$column]), string::lowercase($value)) > 0`
      ]);
      handleParameterChange({
        'column': values.column.value,
        'value': values.value
      });
    }

    if(Object.values(values).length > 0) {
      // for (const value of Object.values(values)) {
      //   console.log(value)
      //   if (value.value && value.value.trim() !== '') {
      //     handleFilterChange([
      //       `string::lowercase($this[$column]) ~ $value`
      //     ]);
      //     handleParameterChange({
      //       'column': value.name,
      //       'value': values.value
      //     });
      //   }
      // }
    }else{
      handleFilterChange([]);
    }
  };

  const handleCustomSearch = (values: any) => {
    customSearchHandler?.(values?.customSearchValue);
  };

  return (
    <>
      <div className="my-5 flex justify-between">
        <div className="inline-flex justify-start">
          {(customSearch || enableSearch !== false) && (
            <form
              className="flex gap-3"
              onSubmit={handleSubmit(customSearch ? handleCustomSearch : handleColumnFilter)}>
              {customSearch ? (
                <Controller
                  render={({ field }) => (
                    <div className="relative w-72">
                      <Input
                        value={field.value}
                        onChange={field.onChange}
                        placeholder={t('actions.search')}
                        type="search"
                        className="pr-10"
                      />
                    </div>
                  )}
                  name="customSearchValue"
                  control={control}
                />
              ) : (
                <>
                  <Controller
                    render={({ field }) => (
                      <Input
                        value={field.value}
                        onChange={field.onChange}
                        placeholder={t('actions.search')}
                        type="search"
                      />
                    )}
                    name="value"
                    control={control}
                  />

                  <Controller
                    name="column"
                    render={({ field }) => (
                      <ReactSelect
                        onChange={field.onChange}
                        options={filterOptions}
                        className="w-72"
                        value={field.value}
                      />
                    )}
                    control={control}
                  />

                  {dropdownFilters && dropdownFilters.map(item => (
                    <Controller
                      name={item.name}
                      render={({ field }) => (
                        <ReactSelect
                          onChange={field.onChange}
                          options={item.options}
                          className="w-72"
                          value={field.value}
                        />
                      )}
                      control={control}
                    />
                  ))}
                </>
              )}

              <button className="btn btn-primary w-12" type="submit">
                <FontAwesomeIcon icon={faSearch}/>
              </button>
              {Object.keys(filters).length > 0 && (
                <button
                  className="btn btn-danger"
                  type="button"
                  onClick={() => {
                    resetFilters()
                    setValue('value', undefined)
                  }}>
                  <FontAwesomeIcon icon={faClose}/>
                </button>
              )}
            </form>
          )}
        </div>
        <div className="inline-flex justify-end">
          <div className="flex gap-3">
            {enableRefresh && (
              <button className="btn btn-primary w-12" onClick={fetchData}>
                <FontAwesomeIcon icon={faRefresh}/>
              </button>
            )}

            {(table.getIsSomeRowsSelected() || table.getIsAllRowsSelected()) && selectionButtons && (
              <>
                {selectionButtons?.map((button, buttonIdx) => (
                  <React.Fragment key={buttonIdx}>{button}</React.Fragment>
                ))}
              </>
            )}
            <>
              {buttons?.map((button, buttonIdx) => (
                <React.Fragment key={buttonIdx}>{button}</React.Fragment>
              ))}
            </>
          </div>
        </div>
      </div>

      <div className="table-responsive">
        <table
          className={classNames(
            "table table-hover table-background table-sm",
            isLoading && "table-fixed table-loading"
          )}>
          <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr
              key={Math.random() + headerGroup.id}
              id={Math.random() + headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th key={header.id}>
                  <div
                    {...{
                      className: header.column.getCanSort()
                        ? "cursor-pointer select-none"
                        : "",
                      onClick: header.column.getToggleSortingHandler(),
                    }}>
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                    {{
                      asc: " ▲",
                      desc: " ▼",
                    }[header.column.getIsSorted() as string] ?? null}
                  </div>
                </th>
              ))}
            </tr>
          ))}
          </thead>
          <tbody>
          {isLoading ? (
            <tr>
              <td colSpan={table.getFlatHeaders().length}>
                <div className="flex justify-center items-center">
                  <Loader
                    lines={loaderLines || 10}
                    lineItems={loaderLineItems || 5}
                  />
                </div>
              </td>
            </tr>
          ) : (
            <>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={Math.random() + cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </>
          )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <nav className="input-group">
          <button
            className="btn btn-primary"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}>
            {"<<"}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}>
            {"<"}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}>
            {">"}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}>
            {">>"}
          </button>
        </nav>
        &bull;
        <span className="flex items-center gap-1">
          <div>{t("table.page")}</div>
          <strong>
            {table.getState().pagination.pageIndex + 1} {t("table.of")}{" "}
            {table.getPageCount()}
          </strong>
        </span>
        &bull; <span>{t("table.goToPage")}</span>
        <span className="flex items-center gap-2">
          <select
            value={table.getState().pagination.pageIndex + 1}
            onChange={(e) => {
              table.setPageIndex(Number(e.target.value) - 1);
            }}
            className="w-auto form-control">
            {_.range(0, table.getPageCount()).map((pageSize) => (
              <option key={pageSize} value={pageSize + 1}>
                {pageSize + 1}
              </option>
            ))}
          </select>
        </span>
        &bull;
        <span className="flex items-center gap-2">
          <select
            value={table.getState().pagination.pageSize}
            onChange={(e) => {
              table.setPageSize(Number(e.target.value));
            }}
            className="w-auto form-control">
            {Object.keys(pageSizes).map((pageSize: string | number) => (
              <option key={pageSize} value={pageSizes[pageSize]}>
                {t("table.show")} {pageSize}
              </option>
            ))}
          </select>{" "}
          &bull; <span className="flex-grow flex-shrink-0">{t("table.totalRecords")}</span>{" "}
          <strong>{total}</strong>
        </span>
      </div>
    </>
  );
};
