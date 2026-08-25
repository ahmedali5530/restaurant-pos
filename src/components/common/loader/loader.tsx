import {ReactNode, useEffect, useState} from "react";
import uniqueId from "lodash/uniqueId";

interface LoaderProps{
  lines?: number;
  lineItems?: number;
}

export const Loader = ({lines = 5, lineItems = 5}: LoaderProps) => {
  const [items, setItems] = useState<ReactNode[]>([]);
  useEffect(() => {
    const a: ReactNode[] = [];
    for(let i = 1; i <= lines; i++){
      const b: ReactNode[] = [];
      for(let j = 1; j <= lineItems; j++){
        b.push(
          <div className="h-5 bg-gray-300 rounded-full w-24" key={uniqueId()}></div>
        );
      }
      a.push(
        <div className="flex justify-between items-center gap-5 p-5" key={uniqueId()}>
          {b}
        </div>
      );
    }

    setItems(a);
  }, [lines, lineItems]);

  return (
    <div role="status"
         className="gap-5 w-full divide-y divide-gray-300 animate-pulse">
      {items}
      <span className="sr-only">Loading...</span>
    </div>
  );
};
