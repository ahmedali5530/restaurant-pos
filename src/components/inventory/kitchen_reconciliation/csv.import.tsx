import {useRef} from "react";
import {CsvUploadModal, CsvFieldConfig} from "@/components/common/table/csv.uploader.tsx";

const fields: CsvFieldConfig[] = [
  {name: "item_code", label: "Item Code", defaultCsvHeader: "item_code"},
  {name: "physical_count", label: "Physical Count", defaultCsvHeader: "physical_count"},
  {name: "waste", label: "Waste", defaultCsvHeader: "waste"},
  {name: "staff_meal", label: "Staff Meal", defaultCsvHeader: "staff_meal"},
  {name: "complimentary", label: "Complimentary", defaultCsvHeader: "complimentary"},
];

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onImportRows: (rows: Array<Record<string, string>>) => Promise<void>;
};

export const ReconciliationCsvImportModal = ({isOpen, onClose, onImportRows}: Props) => {
  const batchRef = useRef<Array<Record<string, string>>>([]);

  return (
    <CsvUploadModal
      isOpen={isOpen}
      onClose={() => {
        batchRef.current = [];
        onClose();
      }}
      fields={fields}
      onCreateRow={async (row) => {
        batchRef.current.push(row);
      }}
      onDone={async () => {
        if (batchRef.current.length > 0) {
          await onImportRows([...batchRef.current]);
        }
        batchRef.current = [];
      }}
    />
  );
};
