import { useMemo, useState } from 'react';
import { useQuery, useQueryClient, UseQueryResult } from '@tanstack/react-query';
import { useDB } from "@/api/db/db.ts";
import { useQueryBuilder } from "@/api/db/query-builder.ts";
import {useDatabase} from "@/hooks/useDatabase.ts";

export interface UseApiResult<T = any> {
  data: T | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  filters: string[];
  handleFilterChange: (newFilters: string[], condition?: 'and'|'or') => void;
  addFilter: (filter: string, condition?: 'and'|'or') => void;
  resetFilters: () => void;
  sorts: string[];
  handleSortChange: (newSort: string[]) => void;
  page: number;
  handlePageChange: (newPage: number) => void;
  pageSize: number;
  handlePageSizeChange: (newPageSize: number) => void;
  selects: string[];
  handleSelectsChange: (newSelects: string[]) => void;
  splits: string[];
  handleSplitsChange: (newSplits: string[]) => void;
  fetches: string[];
  handleFetchesChange: (newFetches: string[]) => void;
  groups: string[];
  handleGroupsChange: (newGroups: string[]) => void;
  parameters: Record<string, any>
  handleParameterChange: (newParameters: Record<string, any>) => void;
  fetchData: () => void;
  fetch: () => void;
}

export interface SettingsData<T = any> {
  total?: number;
  data?: T[]
}

function useApi<T>(
  thing?: string,
  initialFilters: string[] = [],
  initialSort: string[] = [],
  initialOffset?: number,
  initialLimit?: number,
  initialFetches: string[] = [],
  useApiOptions?: any,
  initialSelects: string[] = ['*'],
): UseApiResult<T> {
  const [table, setTable] = useState<string|undefined>(thing);
  const [filters, setFilters] = useState<string[]>(initialFilters);
  const [sorts, setSorts] = useState<string[]>(initialSort);
  const [page, setPage] = useState<number>(initialOffset);
  const [pageSize, setPageSize] = useState<number>(initialLimit);
  const [selects, setSelects] = useState<string[]>(initialSelects);
  const [splits, setSplits] = useState<string[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [fetches, setFetches] = useState<string[]>(initialFetches);
  const [parameters, setParameters] = useState({});

  const queryClient = useQueryClient();
  const { isConnected } = useDatabase();
  const db = useDB();
  const { enabled: enabledOverride = true, ...restApiOptions } = useApiOptions ?? {};
  const queryBuilder = useQueryBuilder(table, initialSelects, initialFilters, initialLimit, initialOffset, initialSort, initialFetches);

  const mainQuery = useMemo(() => {
    return queryBuilder.queryString;
  }, [queryBuilder.queryString]);

  const queryKeys = [table, { filters, sorts, page, pageSize, selects, splits, groups, fetches, parameters, mainQuery }];

  const fetchFilteredData = async () => {
    // Ensure database is connected before executing queries
    if (!isConnected) {
      throw new Error('Database is not connected. Please wait for the connection to be established.');
    }
    
    if (!db) {
      throw new Error('Database instance is not available.');
    }
    
    try {
      const [totalQuery] = await db.query<[{ count?: number }[]]>(
        `Select count() from ${table}${filters.length > 0 ? ` WHERE ${filters.join(' and ')}` : ''} group all`
      );
      const [listQuery] = await db.query<[T[]]>(mainQuery, queryBuilder.parameters);

      return{
        total: totalQuery?.[0]?.count || 0,
        data: listQuery || []
      };
    } catch (error: any) {
      // If we get a "No socket" error, it means the connection was lost
      if (error?.message?.includes('socket') || error?.message?.includes('connected')) {
        console.error('Database connection lost during query:', error);
        throw new Error('Database connection was lost. Please refresh the page.');
      }
      throw error;
    }
  }

  const {
    data,
    isLoading,
    isError,
    isFetching,
    error,
    refetch,
  }: UseQueryResult<T> = useQuery({
    queryKey: queryKeys,
    queryFn: fetchFilteredData,
    enabled: isConnected && !!db && !!table && enabledOverride,
    refetchOnWindowFocus: false,
    retry: false,
    gcTime: 0,
    ...restApiOptions,
  });

  const resetFilters = () => {
    setFilters(initialFilters);
    setPage(initialOffset);

    queryBuilder.setOffset(initialOffset);
    queryBuilder.setLimit(initialLimit);
    queryBuilder.setOrderBys(initialSort);
    queryBuilder.setWheres(initialFilters);
  }

  const handleFilterChange = (newFilters: string[], condition = 'and'): void => {
    setFilters(newFilters);

    newFilters.forEach(c => {
      queryBuilder.setWhere(c, condition, parameters);
    });

    setPage(0);
    queryBuilder.setOffset(0);
  };

  const addFilter = (newFilter: string, condition = 'and', params?: Record<string, any>) => {
    setFilters(prev => [
      ...prev,
      newFilter
    ]);

    queryBuilder.addWhere(newFilter, condition, params);
  }

  const handleSortChange = (newSort: string[]): void => {
    setSorts(newSort);
    setPage(0);

    queryBuilder.setOffset(0);
    queryBuilder.setOrderBys(newSort);
  };

  const handlePageChange = (newPage: number): void => {
    setPage(newPage);
    queryBuilder.setOffset(newPage);
  };

  const handlePageSizeChange = (newPageSize: number): void => {
    setPageSize(newPageSize);
    queryBuilder.setLimit(newPageSize);
  }

  const handleSplitsChange = (newSplits: string[]) => {
    setSplits(newSplits);
    queryBuilder.setSplits(newSplits);
  }

  const handleSelectsChange = (newSelects: string[]) => {
    setSelects(newSelects);
    queryBuilder.setSelects(newSelects);
  }

  const handleGroupsChange = (newGroups: string[]) => {
    setGroups(newGroups);
    queryBuilder.setGroups(newGroups);
  }

  const handleFetchesChange = (newFetches: string[]) => {
    setFetches(newFetches);
    queryBuilder.setFetches(newFetches);
  }

  const handleParameterChange = (newParameters: Record<string, any>) => {
    setParameters(newParameters);
    queryBuilder.setParameters(newParameters);
  }

  const manualFetch = async (): Promise<any> => {
    return await queryClient.prefetchQuery({
      queryKey: queryKeys,
      queryFn: fetchFilteredData,
      refetchOnWindowFocus: false,
      ...restApiOptions,
    });
  }

  return {
    splits, handleSplitsChange,
    selects, handleSelectsChange,
    fetches, handleFetchesChange,
    groups, handleGroupsChange,
    isError, error,
    filters, resetFilters, handleFilterChange, addFilter,
    sorts, handleSortChange,
    page, pageSize,
    handlePageChange, handlePageSizeChange,
    data,
    fetchData: refetch, fetch: manualFetch, isFetching, isLoading,
    parameters, handleParameterChange,
  };
}

export default useApi;
