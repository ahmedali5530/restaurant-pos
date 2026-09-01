/**
 * QR code generator for kiosk mode — generates a QR code that links to
 * the kiosk URL so customers can scan and order from their phone.
 *
 * Uses react-qr-code (already a dependency).
 */

import { QRCode } from "react-qr-code";
import { useTranslation } from "react-i18next";

export function KioskQRCode({
  url,
  title,
}: {
  url: string;
  title?: string;
}) {
  const { t } = useTranslation(["kiosk"]);

  return (
    <div
      className="flex flex-col items-center p-6 bg-white rounded-2xl shadow-lg"
      data-testid="kiosk-qr-code"
    >
      {title && (
        <h3 className="text-lg font-bold mb-3 text-center">{title}</h3>
      )}
      <div className="p-4 bg-white border-2 border-neutral-200 rounded-xl">
        <QRCode
          value={url}
          size={200}
          level="M"
          bgColor="#ffffff"
          fgColor="#000000"
        />
      </div>
      <p className="text-sm text-neutral-500 mt-3 text-center max-w-[200px]">
        {t("kiosk:qr.scanToOrder", {
          defaultValue: "Scan with your phone camera to start ordering",
        })}
      </p>
    </div>
  );
}

/**
 * Generate the kiosk URL for a given table.
 * Example: https://posr.example.com/kiosk?table=T1
 */
export function generateKioskUrl(
  baseUrl: string,
  table?: string
): string {
  const url = new URL("/kiosk", baseUrl);
  if (table) {
    url.searchParams.set("table", table);
  }
  return url.toString();
}
