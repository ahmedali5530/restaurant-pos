import type React from 'react';
import QRCodeModule from 'react-qr-code';

export type ReactQrCodeProps = {
  value: string;
  size?: number;
  bgColor?: string;
  fgColor?: string;
  level?: 'L' | 'M' | 'H' | 'Q';
};

export const ReactQrCode: React.ComponentType<ReactQrCodeProps> =
  typeof QRCodeModule === 'function'
    ? (QRCodeModule as React.ComponentType<ReactQrCodeProps>)
    : ((QRCodeModule as { default?: React.ComponentType<ReactQrCodeProps> }).default ??
      (QRCodeModule as { QRCode?: React.ComponentType<ReactQrCodeProps> }).QRCode ??
      QRCodeModule) as React.ComponentType<ReactQrCodeProps>;
