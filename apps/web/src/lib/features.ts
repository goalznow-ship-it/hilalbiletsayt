// OMR screens (answer keys, sheets, uploads, manual review) are enabled
// unless a deployment opts out at build time with NEXT_PUBLIC_OMR_ENABLED=false.
export const OMR_ENABLED = process.env.NEXT_PUBLIC_OMR_ENABLED !== "false";
