import React, {useEffect, useMemo, useRef, useState} from "react";
import {createRoot} from "react-dom/client";
import {getPrintTemplate, PRINT_EVENT, PrintEventDetail} from "@/lib/print.service.ts";

export const PrintProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [queue, setQueue] = useState<PrintEventDetail<any>[]>([]);
  const isPrintingRef = useRef(false);

  useEffect(() => {
    function onPrint(e: Event) {
      const custom = e as CustomEvent<PrintEventDetail<any>>;
      setQueue(prev => [...prev, custom.detail]);
    }

    window.addEventListener(PRINT_EVENT, onPrint as EventListener);
    return () => window.removeEventListener(PRINT_EVENT, onPrint as EventListener);
  }, []);

  useEffect(() => {
    if (isPrintingRef.current) return;
    if (queue.length === 0) return;
    isPrintingRef.current = true;

    const job = queue[0];
    const renderer = getPrintTemplate(job.template);
    if (!renderer) {
      // Drop job if no renderer; continue with next
      setQueue(prev => prev.slice(1));
      isPrintingRef.current = false;
      return;
    }

    const markup = renderer(job.payload);
    const printWindow: any = window.open('', '', 'height=600,width=400');
    if (!printWindow) {
      setQueue(prev => prev.slice(1));
      isPrintingRef.current = false;
      return;
    }
    if (job.title) {
      printWindow.document.title = job.title;
    }

    const container = printWindow.document.body;
    const root = createRoot(container);
    root.render(markup);

    const doPrint = async () => {
      // wait a tick for layout/styles
      await new Promise(r => setTimeout(r, 50));
      const copies = Math.max(1, job.copies ?? 1);
      for (let i = 0; i < copies; i++) {
        printWindow.focus();
        printWindow.print();
      }
      printWindow.close();
      setQueue(prev => prev.slice(1));
      isPrintingRef.current = false;
    };

    // small delay to ensure content is in DOM
    setTimeout(doPrint, 100);
  }, [queue]);

  return <>{children}</>;
};



