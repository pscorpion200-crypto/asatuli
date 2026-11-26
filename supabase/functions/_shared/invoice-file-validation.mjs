export const MAX_INVOICE_SIZE = 8 * 1024 * 1024;
export const MAX_INVOICE_COUNT = 5;

const startsWith = (bytes, signature) =>
  signature.every((byte, index) => bytes[index] === byte);

const asciiAt = (bytes, offset, value) =>
  [...value].every((character, index) => bytes[offset + index] === character.charCodeAt(0));

/**
 * Identify a supported invoice format from its file signature, never from
 * the browser-provided filename or MIME type.
 *
 * @param {Uint8Array} bytes
 * @returns {{ mime: string, extension: string } | null}
 */
export function detectInvoiceType(bytes) {
  if (!(bytes instanceof Uint8Array)) return null;

  if (bytes.length >= 5 && asciiAt(bytes, 0, "%PDF-")) {
    return { mime: "application/pdf", extension: "pdf" };
  }
  if (
    bytes.length >= 8 &&
    startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  ) {
    return { mime: "image/png", extension: "png" };
  }
  if (bytes.length >= 3 && startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return { mime: "image/jpeg", extension: "jpg" };
  }
  if (
    bytes.length >= 12 &&
    asciiAt(bytes, 0, "RIFF") &&
    asciiAt(bytes, 8, "WEBP")
  ) {
    return { mime: "image/webp", extension: "webp" };
  }
  if (
    bytes.length >= 6 &&
    (asciiAt(bytes, 0, "GIF87a") || asciiAt(bytes, 0, "GIF89a"))
  ) {
    return { mime: "image/gif", extension: "gif" };
  }

  return null;
}
