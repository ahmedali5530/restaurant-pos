import { useMemo, useState } from "react";

export interface QueryBuilderReturnProps {
  queryString: string
  table: string
  setTable: (table: string) => void
  selects: string[]
  setSelects: (selects: string[]) => void
  addSelect: (select: string) => void
  wheres: string[]
  setWheres: (wheres: string[]) => void
  addWhere: (where: string) => void
  setWhere: (wheres: string[]) => void
  parameters: any
  addParameter: (parameter: string, val: string|number|string[]|number[]) => void
  setParameters
  groups
  setGroups
  addGroup
  limit
  setLimit
  offset
  setOffset
  splits
  setSplits
  orderBys
  setOrderBys
  addOrderBy
  fetches
  setFetches
  addFetch
}

export const useQueryBuilder = (tb: string, cols: string|string[] = '*', conditions: string[] = [], initialLimit?: number, initialOffset?: number, initialOrders = [], initialFetches = []) => {

  const [selects, setSelects] = useState<string[]>(Array.isArray(cols) ? cols : [cols]);
  const [table, setTable] = useState(tb);
  const [wheres, setWheres] = useState(conditions);
  const [splits, setSplits] = useState([]);
  const [groups, setGroups] = useState([]);
  const [orderBys, setOrderBys] = useState(initialOrders);
  const [limit, setLimit] = useState<number|undefined>(initialLimit);
  const [offset, setOffset] = useState(initialOffset);
  const [fetches, setFetches] = useState(initialFetches);

  const [parameters, setParameters] = useState({});

  const queryString = useMemo(() => {
    const q = [];

    // columns
    q.push(`SELECT ${selects.join(',')} FROM ${table}`);

    // where conditions
    if( wheres.length > 0 ) {
      q.push('WHERE ');
      const w = [...wheres];

      // remove 'and', 'or' from first where condition
      w[0] = w[0].replace(/^(and|or)\b\s*/, '');

      q.push(w.map(item => item.trim()).join(' '));
    }

    // split statement
    if( splits.length > 0 ) {
      q.push('SPLIT ');
      q.push(splits.join(', '));
    }

    // group by statements
    if( groups.length > 0 ) {
      q.push('GROUP BY ');
      q.push(groups.join(', '));
    }

    // order by statements
    if( orderBys.length > 0 ) {
      q.push('ORDER BY ');
      q.push(orderBys.join(', '));
    }

    // limit
    if( limit ) {
      q.push(`LIMIT ${limit}`);
    }

    // offset
    if( offset ) {
      q.push(`START ${offset}`);
    }

    // fetches
    if( fetches.length > 0 ) {
      q.push(`FETCH ${fetches.join(', ')}`);
    }

    return q.join(' ');
  }, [selects, table, wheres, splits, groups, orderBys, limit, offset, fetches]);

  const addSelect = (cols: string[]) => {
    setSelects(prev => [
      ...prev,
      ...cols
    ]);
  }

  const addWhere = (w: string, condition = 'and', parameters: Record<string, string> = {}) => {
    setWheres(prev => [
      ...prev,
      `${condition} ${w}`
    ]);

    setParameters(prev => ({
      ...prev,
      ...parameters
    }));
  }

  const setWhere = (w: string, condition = 'and', parameters: Record<string, string> = {}) => {
    setWheres([
      `${condition} ${w}`
    ]);

    setParameters({
      ...parameters
    });
  }

  const addParameter = (parameter: string, val: string|number|string[]|number[]) => {
    setParameters(prev => ({
      ...prev,
      [parameter]: val
    }));
  }

  const addGroup = (val: string) => {
    setGroups(prev => ({
      ...prev,
      val
    }));
  }

  const addOrderBy = (val: string) => {
    setOrderBys(prev => ({
      ...prev,
      val
    }));
  }

  const addFetch = (val: string) => {
    setFetches(prev => ([
      ...prev,
      val
    ]))
  }

  return {
    queryString,
    table, setTable,
    selects, setSelects, addSelect,
    wheres, setWheres, addWhere, setWhere,
    parameters, addParameter, setParameters,
    groups, setGroups, addGroup,
    limit, setLimit,
    offset, setOffset,
    splits, setSplits,
    orderBys, setOrderBys, addOrderBy,
    fetches, setFetches, addFetch,
  };
}
