/**
 * Downloads an ArrayBuffer as a file
 * @param arrayBuffer - The ArrayBuffer or string (base64) to download
 * @param filename - The name of the file to download
 * @param mimeType - The MIME type of the file (default: 'application/octet-stream')
 */
export const downloadArrayBuffer = (
  arrayBuffer: ArrayBuffer | string,
  filename: string,
  mimeType: string = 'application/octet-stream'
) => {
  const buffer = toArrayBuffer(arrayBuffer);
  const blob = new Blob([buffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Converts binary data from SurrealDB (Uint8Array, ArrayBuffer, base64 string) to Uint8Array
 */
export const toUint8Array = (value: unknown): Uint8Array => {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  if (typeof value === 'string') {
    const binaryString = atob(value);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }
  throw new Error('Invalid value type for binary conversion');
};

/**
 * Converts a value that might be ArrayBuffer or string to ArrayBuffer
 */
export const toArrayBuffer = (value: ArrayBuffer | Uint8Array | string): ArrayBuffer => {
  if (value instanceof ArrayBuffer) {
    return value;
  }
  if (value instanceof Uint8Array) {
    return toUint8Array(value).buffer.slice(
      value.byteOffset,
      value.byteOffset + value.byteLength
    ) as ArrayBuffer;
  }
  if (typeof value === 'string') {
    return toUint8Array(value).buffer;
  }
  throw new Error('Invalid value type for ArrayBuffer conversion');
};

/**
 * Attempts to detect the MIME type from file content or uses a default
 * @param arrayBuffer - The ArrayBuffer or string (base64) to analyze
 * @param defaultMimeType - Default MIME type if detection fails
 */
export const detectMimeType = (
  arrayBuffer: ArrayBuffer | Uint8Array | string,
  defaultMimeType: string = 'application/octet-stream'
): string => {
  const buffer = arrayBuffer instanceof Uint8Array
    ? arrayBuffer.buffer.slice(arrayBuffer.byteOffset, arrayBuffer.byteOffset + arrayBuffer.byteLength)
  : toArrayBuffer(arrayBuffer);
  // Check for common file signatures
  const bytes = new Uint8Array(buffer.slice(0, 4));
  
  // PDF
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return 'application/pdf';
  }
  
  // PNG
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    return 'image/png';
  }
  
  // JPEG
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
    return 'image/jpeg';
  }
  
  // GIF
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return 'image/gif';
  }
  
  // ZIP
  if (bytes[0] === 0x50 && bytes[1] === 0x4B && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07)) {
    return 'application/zip';
  }

  if (
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46    // F
  ) {
    return "image/webp";
  }
  
  return defaultMimeType;
};

