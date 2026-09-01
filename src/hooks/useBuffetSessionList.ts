import {useCallback, useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {useDB} from "@/api/db/db.ts";
import {UseApiResult, SettingsData} from "@/api/db/use.api.ts";
import {BuffetSession} from "@/api/model/buffet_session.ts";
import {
  BuffetSessionListFilters,
  listBuffetSessions,
} from "@/lib/inventory/buffet.service.ts";
import {useDatabase} from "@/hooks/useDatabase.ts";

export function useBuffetSessionList(
  initialPage = 0,
  initialPageSize = 10
): UseApiResult<SettingsData<BuffetSession>> & {
  listFilters: BuffetSessionListFilters;
  setListFilters: (filters: BuffetSessionListFilters) => void;
} {
  const db = useDB();
  const {isConnected} = useDatabase();
  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [listFilters, setListFilters] = useState<BuffetSessionListFilters>({});
  const [filters] = useState<string[]>([]);
  const [sorts, setSorts] = useState<string[]>(["business_date DESC"]);

  const queryKey = ["buffet_sessions", page, pageSize, listFilters];

  const {data, isLoading, isFetching, isError, error, refetch} = useQuery({
    queryKey,
    queryFn: () =>
      listBuffetSessions(db, {page, pageSize, filters: listFilters}),
    enabled: isConnected && !!db,
    refetchOnWindowFocus: false,
    retry: false,
    gcTime: 0,
  });

  const fetchData = useCallback(() => {
    void refetch();
  }, [refetch]);

  return {
    data,
    isLoading,
    isFetching,
    isError,
    error,
    filters,
    handleFilterChange: () => {},
    addFilter: () => {},
    resetFilters: () => {
      setListFilters({});
      setPage(0);
    },
    sorts,
    handleSortChange: setSorts,
    page,
    handlePageChange: setPage,
    pageSize,
    handlePageSizeChange: setPageSize,
    selects: [],
    handleSelectsChange: () => {},
    splits: [],
    handleSplitsChange: () => {},
    fetches: [],
    handleFetchesChange: () => {},
    groups: [],
    handleGroupsChange: () => {},
    parameters: {},
    handleParameterChange: () => {},
    fetchData,
    fetch: fetchData,
    listFilters,
    setListFilters,
  };
}
