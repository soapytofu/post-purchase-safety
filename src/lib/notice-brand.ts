// Older RSS imports may have mistaken the issuing agency for a firm. Also
// protect their display until the corrected parser refreshes those records.
export function noticeBrand(notice: { sourceAuthority: string; brand: string | null }) {
  const brand = notice.brand?.trim();
  return !brand || (notice.sourceAuthority === "USDA FSIS" && /^(?:USDA\s+)?FSIS$/i.test(brand)) ? "Not specified" : brand;
}
