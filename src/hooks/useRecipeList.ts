import {useCallback, useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {useDB} from "@/api/db/db.ts";
import {UseApiResult, SettingsData} from "@/api/db/use.api.ts";
import {Recipe} from "@/api/model/recipe.ts";
import {listRecipes, RecipeInput} from "@/lib/inventory/production.service.ts";
import {useDatabase} from "@/hooks/useDatabase.ts";

export function useRecipeList(
  initialPage = 0,
  initialPageSize = 10
): UseApiResult<SettingsData<Recipe>> {
  const db = useDB();
  const {isConnected} = useDatabase();
  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [filters] = useState<string[]>([]);
  const [sorts, setSorts] = useState<string[]>(["name ASC"]);

  const queryKey = ["recipes", page, pageSize];

  const {data, isLoading, isFetching, isError, error, refetch} = useQuery({
    queryKey,
    queryFn: () => listRecipes(db, {page, pageSize}),
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
    resetFilters: () => setPage(0),
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
  };
}

export type {RecipeInput};
