import {useCallback, useRef, useState} from "react";
import {
  finalizeStructured,
  revalidateImportRecords,
  runImportPipeline,
  type PipelinePhaseResult,
} from "@/lib/data-import/pipeline.ts";
import {runImport, type RunImportOptions} from "@/lib/data-import/run-import.ts";
import type {
  ColumnMapping,
  ExtractProgress,
  ImportConfiguration,
  ImportRecord,
  ImportSummary,
  StructuredExtractResult,
} from "@/lib/data-import/types.ts";
import {assertFileWithinLimit, MAX_IMPORT_UPLOAD_BYTES} from "@/utils/files.ts";

export type DataImportStep =
  | "upload"
  | "mapping"
  | "extracting"
  | "review"
  | "importing"
  | "summary";

export type UseDataImportOptions = {
  config: ImportConfiguration;
};

export type RecordsUpdater =
  | ImportRecord[]
  | ((prev: ImportRecord[]) => ImportRecord[]);

export function useDataImport({config}: UseDataImportOptions) {
  const [step, setStep] = useState<DataImportStep>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ExtractProgress | null>(null);
  const [records, setRecords] = useState<ImportRecord[]>([]);
  const [structured, setStructured] = useState<StructuredExtractResult | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const reset = useCallback(() => {
    cancel();
    setStep("upload");
    setFile(null);
    setError(null);
    setProgress(null);
    setRecords([]);
    setStructured(null);
    setMapping({});
    setSummary(null);
  }, [cancel]);

  const applyPipelineResult = useCallback((result: PipelinePhaseResult) => {
    if (result.phase === "mapping_required") {
      setStructured(result.structured);
      setMapping(result.mapping);
      setStep("mapping");
      return;
    }
    setRecords(result.records);
    if (result.structured) setStructured(result.structured);
    if (result.mapping) setMapping(result.mapping);
    setStep("review");
  }, []);

  const startWithFile = useCallback(
    async (nextFile: File) => {
      setError(null);
      try {
        assertFileWithinLimit(nextFile, MAX_IMPORT_UPLOAD_BYTES);
      } catch (err: any) {
        setError(err?.message || String(err));
        return;
      }

      cancel();
      const controller = new AbortController();
      abortRef.current = controller;

      setFile(nextFile);
      setStep("extracting");
      setProgress({stage: "detect", current: 0, total: 1});

      try {
        const result = await runImportPipeline(config, nextFile, {
          signal: controller.signal,
          onProgress: setProgress,
        });
        applyPipelineResult(result);
      } catch (err: any) {
        if (err?.name === "AbortError") {
          setError(null);
          setStep("upload");
          return;
        }
        setError(err?.message || String(err));
        setStep("upload");
      } finally {
        setProgress(null);
        abortRef.current = null;
      }
    },
    [applyPipelineResult, cancel, config]
  );

  const confirmMapping = useCallback(
    async (nextMapping: ColumnMapping, sheetIndex?: number) => {
      if (!structured) return;
      setError(null);
      cancel();
      const controller = new AbortController();
      abortRef.current = controller;
      setMapping(nextMapping);
      setStep("extracting");

      try {
        const nextStructured = {
          ...structured,
          sheetIndex: sheetIndex ?? structured.sheetIndex,
        };
        setStructured(nextStructured);
        const result = await finalizeStructured(config, nextStructured, nextMapping, {
          signal: controller.signal,
          onProgress: setProgress,
        });
        applyPipelineResult(result);
      } catch (err: any) {
        if (err?.name === "AbortError") {
          setStep("mapping");
          return;
        }
        setError(err?.message || String(err));
        setStep("mapping");
      } finally {
        setProgress(null);
        abortRef.current = null;
      }
    },
    [applyPipelineResult, cancel, config, structured]
  );

  const updateRecords = useCallback((next: RecordsUpdater) => {
    setRecords((prev) => (typeof next === "function" ? next(prev) : next));
  }, []);

  const patchRecordAt = useCallback(
    (index: number, patch: (record: ImportRecord) => ImportRecord) => {
      setRecords((prev) => {
        const current = prev[index];
        if (!current) return prev;
        const updated = patch(current);
        if (updated === current) return prev;
        const next = prev.slice();
        next[index] = updated;
        return next;
      });
    },
    []
  );

  const revalidate = useCallback(async () => {
    const next = await revalidateImportRecords(config, records);
    setRecords([...next]);
    return next;
  }, [config, records]);

  const confirmImport = useCallback(
    async (opts?: RunImportOptions) => {
      setError(null);
      cancel();
      const controller = new AbortController();
      abortRef.current = controller;
      setStep("importing");

      try {
        const result = await runImport(config, records, {
          ...opts,
          signal: controller.signal,
          onProgress: (current, total) =>
            setProgress({stage: "import", current, total}),
        });
        setSummary(result);
        setStep("summary");
        return result;
      } catch (err: any) {
        if (err?.name === "AbortError") {
          setStep("review");
          return null;
        }
        setError(err?.message || String(err));
        setStep("review");
        return null;
      } finally {
        setProgress(null);
        abortRef.current = null;
      }
    },
    [cancel, config, records]
  );

  return {
    step,
    setStep,
    file,
    error,
    setError,
    progress,
    records,
    structured,
    mapping,
    setMapping,
    summary,
    startWithFile,
    confirmMapping,
    updateRecords,
    patchRecordAt,
    revalidate,
    confirmImport,
    cancel,
    reset,
  };
}
