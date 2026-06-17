import {Modal} from "@/components/common/react-aria/modal.tsx";
import { useState } from "react";
import { useTranslation } from 'react-i18next';
import { createWorker } from "tesseract.js";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faUpload} from "@fortawesome/free-solid-svg-icons";

interface Props {
  onClose: () => void;
}

export const InventoryPurchaseUpload = ({
  onClose
}: Props) => {
  const { t } = useTranslation('inventory');
  const [image, setImage] = useState(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImage(URL.createObjectURL(file));
    await readImage(file);
  };

  function extractItems(ocrText) {
    const lines = ocrText.split("\n").map(l => l.trim()).filter(Boolean);

    const items = [];

    // number finder (qty or price)
    const numberRegex = /\$?\d+(\.\d+)?/g;

    for (const line of lines) {
      if (line.length < 4) continue;

      const matches = [...line.matchAll(numberRegex)];

      // must contain at least 2 numbers to be an item row
      if (matches.length < 2) continue;

      // convert extracted numbers
      const nums = matches.map(m => ({
        value: parseFloat(m[0].replace("$", "")),
        index: m.index, // position in line
        raw: m[0]
      }));

      // Heuristics:
      // - Quantity is usually the *smallest number* in the line (within reason)
      // - Price is usually > 1 and often has decimals
      const sorted = [...nums].sort((a, b) => a.value - b.value);

      const qty = sorted[0].value;                      // smallest = quantity
      const unitPrice = sorted[1].value;                // next smallest = unit price

      const qtyIndex = sorted[0].index;

      // description = everything before quantity
      const desc = line.slice(0, qtyIndex).trim();

      if (!desc || desc.length < 2) continue;

      items.push({
        quantity: qty,
        description: desc,
        unit_price: unitPrice
      });
    }

    return items;
  }

  const readImage = async (file) => {
    setLoading(true);
    setText("");

    const worker = await createWorker('eng');

    const { data } = await worker.recognize(file, {}, {
      blocks: true,
      layoutBlocks: true,
    });

    setText(JSON.stringify(extractItems(data.text), null, 2))

    await worker.terminate();

    setLoading(false);
  };

  return (
    <Modal
      title={t('uploadViaDocument')}
      open={true}
      onClose={onClose}
    >
      <div className="flex flex-col">
        <label htmlFor="file" className="p-5 text-center border-4 border-gray-400 border-dashed bg-white active:border-primary-400">
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="appearance-none h-0 w-0"
            id="file"
          />
          <FontAwesomeIcon icon={faUpload} /> Choose a file
        </label>
        {loading && <div className="alert alert-warning filled mt-3">Reading document… please wait.</div>}

        <div className="grid grid-cols-2 gap-5">
          {image && (
            <div className="col-span-1" style={{ marginTop: "20px" }}>
              <img
                src={image}
                alt="Uploaded"
                style={{ width: "100%", borderRadius: "8px" }}
              />
            </div>
          )}
          {text && (
            <div className="col-span-1" style={{ marginTop: "20px" }}>
              <pre className="overflow-auto">{text}</pre>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}