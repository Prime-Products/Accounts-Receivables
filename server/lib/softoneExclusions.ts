// SoftOne group 473 / code 0547 contains Prime Products' own legal entities.
// They are branches of the creditor, not accounts-receivable customers.
export const SOFTONE_INTERNAL_CUSTOMER_GROUP_ID = 473;

export function excludeInternalCustomerGroup(alias: string) {
  if (!/^[A-Z_][A-Z0-9_]*$/i.test(alias)) {
    throw new Error("Invalid SQL alias for SoftOne exclusion.");
  }
  return `${alias}.[TRDGROUP] <> ${SOFTONE_INTERNAL_CUSTOMER_GROUP_ID}`;
}
