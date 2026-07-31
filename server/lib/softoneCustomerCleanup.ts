export type SoftOneCleanupCustomer = {
  id: number;
  code: string;
  name: string;
  customerGroup: string | null;
  softoneId: string | null;
  softoneSyncedAt: Date | string | null;
};

export type SoftOneCustomerSyncEvidence = {
  syncedAt: Date;
  synchronizedCustomers: number;
  logCreatedAt: Date;
  loggedCustomers: number;
};

export type SoftOneEntityClassification = {
  TRDR?: unknown;
  SODTYPE?: unknown;
  TRDGROUP?: unknown;
};

export function selectConfirmedIneligibleCustomers(
  customers: (SoftOneCleanupCustomer & { softoneId: string })[],
  classifications: SoftOneEntityClassification[],
) {
  const byId = new Map(
    classifications.map(row => [
      String(row.TRDR ?? "").trim(),
      {
        type: Number(row.SODTYPE),
        group: Number(row.TRDGROUP),
      },
    ]),
  );
  return customers.filter(customer => {
    const classification = byId.get(customer.softoneId);
    return (
      classification?.type === 12 ||
      (classification?.type === 13 && classification.group === 473)
    );
  });
}

export function validateSoftOneCustomerSyncEvidence(
  evidence: SoftOneCustomerSyncEvidence,
) {
  if (evidence.synchronizedCustomers !== evidence.loggedCustomers) {
    throw new Error(
      "Cleanup stopped: latest customer timestamp count does not match the latest successful sync log.",
    );
  }
  const completionLag =
    evidence.logCreatedAt.getTime() - evidence.syncedAt.getTime();
  if (completionLag < 0 || completionLag > 60 * 60 * 1_000) {
    throw new Error(
      "Cleanup stopped: latest customer timestamp does not align with the latest successful sync log.",
    );
  }
  return evidence;
}

export function findStaleSoftOneCustomers(
  customers: SoftOneCleanupCustomer[],
  latestSuccessfulSync: Date,
) {
  const latestTimestamp = latestSuccessfulSync.getTime();
  return customers.filter(
    (customer): customer is SoftOneCleanupCustomer & { softoneId: string } =>
      Boolean(
        customer.softoneId &&
          (customer.softoneSyncedAt === null ||
            new Date(customer.softoneSyncedAt).getTime() !== latestTimestamp),
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
