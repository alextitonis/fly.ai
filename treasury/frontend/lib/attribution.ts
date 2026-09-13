/**
 * ERC-8021 Builder Code attribution for Base.
 *
 * Appends a data suffix to transaction calldata so Base can attribute
 * onchain activity to this app. Register at https://base.dev to get
 * your Builder Code (Settings → Builder Code).
 *
 * Format (Schema 0 — Canonical Registry):
 *   codes_ascii_hex ∥ codes_length (1 byte) ∥ schema_id (1 byte) ∥ erc_suffix
 *
 * The erc_suffix is 0x8021 repeated 8 times (16 bytes).
 *
 * Set VITE_BASE_BUILDER_CODE in your .env to enable.
 * Example: VITE_BASE_BUILDER_CODE=bc_yourcode123
 */

const ERC_SUFFIX = "0x80218021802180218021802180218021";

function stringToHex(str: string): string {
  let hex = "0x";
  for (let i = 0; i < str.length; i++) {
    hex += str.charCodeAt(i).toString(16).padStart(2, "0");
  }
  return hex;
}

function numberToHex(n: number, size: number): string {
  let hex = n.toString(16);
  if (hex.length < size * 2) {
    hex = "0".repeat(size * 2 - hex.length) + hex;
  }
  return "0x" + hex;
}

function hexSize(hex: string): number {
  return (hex.length - 2) / 2;
}

function concatHex(...values: string[]): string {
  return values.reduce((acc, val) => acc + val.slice(2), "0x");
}

/**
 * Generates the ERC-8021 data suffix from a Base Builder Code.
 *
 * @param code - Builder code from base.dev (e.g. "bc_abc123")
 * @returns Hex suffix to append to transaction calldata, or undefined if no code provided.
 */
export function builderCodeToDataSuffix(code: string): `0x${string}` | undefined {
  if (!code) return undefined;

  const codesHex = stringToHex(code);
  const codesLength = hexSize(codesHex);
  const codesLengthHex = numberToHex(codesLength, 1);
  const schemaIdHex = numberToHex(0, 1);

  return concatHex(codesHex, codesLengthHex, schemaIdHex, ERC_SUFFIX) as `0x${string}`;
}

/**
 * The data suffix for the configured Base Builder Code.
 * Set VITE_BASE_BUILDER_CODE in .env to enable attribution.
 */
export const DATA_SUFFIX: `0x${string}` | undefined = builderCodeToDataSuffix(
  import.meta.env.VITE_BASE_BUILDER_CODE ?? "",
);
