export type SoftOneCleanupCustomer = {
  id: number;
  code: string;
  name: string;
  customerGroup: string | null;
  softoneId: string | null;
};

export function findIneligibleSoftOneCustomers(
  customers: SoftOneCleanupCustomer[],
  validSoftOneIds: ReadonlySet<string>,
) {
  return customers.filter(
    (customer): customer is SoftOneCleanupCustomer & { softoneId: string } =>
      Boolean(
        customer.softoneId && !validSoftOneIds.has(customer.softoneId),
      ),
  );
}

export function selectCleanupPreviewRows(
  customers: (SoftOneCleanupCustomer & { softoneId: string })[],
  search: string | undefined,
  limit: number,
) {
  const normalizedSearch = search?.trim().toLocaleLowerCase("el") ?? "";
  return customers
    .filter(customer => {
      if (!normalizedSearch) return true;
      return [
        customer.code,
        customer.name,
        customer.customerGroup,
        customer.softoneId,
      ].some(value =>
        (value ?? "").toLocaleLowerCase("el").includes(normalizedSearch),
      );
    })
    .sort((left, right) => left.name.localeCompare(right.name, "el"))
    .slice(0, limit);
}

export function cleanupPreviewLimit(value: string | undefined) {
  const parsed = Number(value ?? "");
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 500
    ? parsed
    : 200;
}
