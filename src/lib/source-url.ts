const AUTHORITY_HOSTS: Record<string, readonly string[]> = {
  "FDA / openFDA": ["api.fda.gov", "fda.gov", "www.fda.gov"],
  FDA: ["api.fda.gov", "fda.gov", "www.fda.gov"],
  CPSC: ["cpsc.gov", "www.cpsc.gov", "saferproducts.gov", "www.saferproducts.gov"],
  "USDA FSIS": ["fsis.usda.gov", "www.fsis.usda.gov"],
};

export function isTrustedSourceUrl(value: string, authority: string): boolean {
  try {
    const url = new URL(value);
    const allowed = AUTHORITY_HOSTS[authority];
    return url.protocol === "https:" && Boolean(allowed?.includes(url.hostname.toLowerCase()));
  } catch {
    return false;
  }
}

export function assertTrustedSourceUrl(value: string, authority: string): void {
  if (!isTrustedSourceUrl(value, authority)) {
    throw new Error(`${authority} returned an untrusted source URL`);
  }
}
