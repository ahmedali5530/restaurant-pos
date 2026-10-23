import {useTranslation} from "react-i18next";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faDownload, faFile} from "@fortawesome/free-solid-svg-icons";
import {Button} from "@/components/common/input/button.tsx";
import {downloadArrayBuffer} from "@/utils/files.ts";

type DocFile = {
  id?: string;
  name?: string;
  type?: string;
  content?: ArrayBuffer | string | null;
};

interface Props {
  documents?: DocFile[] | null;
  downloadPrefix?: string;
}

export const InventoryDocumentAttachments = ({
  documents,
  downloadPrefix = "document",
}: Props) => {
  const {t} = useTranslation("inventory");
  const list = documents ?? [];

  return (
    <div className="bg-surface-elevated rounded-xl shadow border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold text-foreground flex items-center gap-2">
          <FontAwesomeIcon icon={faFile} />
          <span>{t("upload.attachDocuments")}</span>
        </div>
      </div>
      {list.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {list.map((doc, index) => (
            <div
              key={doc.id ?? index}
              className="flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-surface"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-8 w-8 rounded-md bg-primary/10 text-primary-600 flex items-center justify-center">
                  <FontAwesomeIcon icon={faFile} />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium text-foreground truncate">
                    {doc.name ?? `Document ${index + 1}`}
                  </span>
                  <span className="text-xs text-muted">{doc.type ?? "File"}</span>
                </div>
              </div>
              {doc.content != null && (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() =>
                    downloadArrayBuffer(
                      doc.content as any,
                      doc.name ?? `${downloadPrefix}-${index + 1}`,
                      doc.type ?? "application/octet-stream"
                    )
                  }
                >
                  <FontAwesomeIcon icon={faDownload} className="mr-1" />
                  Download
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-muted">
          {t("upload.noDocuments", {defaultValue: "No documents attached."})}
        </div>
      )}
    </div>
  );
};
