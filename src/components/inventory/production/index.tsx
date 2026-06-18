import {useState} from "react";
import {useTranslation} from "react-i18next";
import {Button} from "@/components/common/input/button.tsx";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faPlus} from "@fortawesome/free-solid-svg-icons";
import {ProductionForm} from "@/components/inventory/production/form.tsx";

export const InventoryProduction = () => {
  const {t} = useTranslation("inventory");
  const [formOpen, setFormOpen] = useState(false);

  return (
    <div className="p-6">
      <div className="max-w-2xl">
        <h2 className="text-xl font-semibold mb-2">{t("production.runProduction")}</h2>
        <p className="text-neutral-600 mb-4">{t("production.runProductionHint")}</p>
        <Button variant="primary" icon={faPlus} onClick={() => setFormOpen(true)}>
          {t("production.startBatch")}
        </Button>
      </div>

      {formOpen && (
        <ProductionForm
          open
          onClose={() => setFormOpen(false)}
        />
      )}
    </div>
  );
};
