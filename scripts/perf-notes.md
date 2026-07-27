# Performance investigation notes (27 Jul 2026)

## Baseline (before optimizations, warm 2nd run, server-side probe)
| endpoint | time | payload |
|---|---|---|
| invoices.list | 566ms | 3169KB raw (no gzip) |
| customers.list | 447ms | 1024KB |
| customers.groups | 450ms | 579KB |
| tasks.list | 469ms | 218KB |
| forecast.dashboard | 339ms | 2KB |

Wire sizes were UNCOMPRESSED (no compression middleware). Real user browser logs showed forecast.dashboard+auth.me ~700ms avg, invoices batches ~800-1100ms.

## Root causes found
1. **No gzip** on Express → invoices.list shipped 3.2MB JSON per load.
2. invoices.list returned all columns (notes, createdAt, updatedAt, softoneId...) → trimmed to UI-used fields only (3169KB → 2164KB raw → **188KB gzipped on wire**).
3. Invoices page mounted **5459 table rows** in DOM at once → main browser freeze. Fixed with incremental rendering (200 rows + Load more).
4. QueryClient had no staleTime → every navigation refetched all heavy lists; refetchOnWindowFocus on.
5. Customers page fetched BOTH customers.list AND customers.groups even in groups view → customers.list now enabled only in companies view.
6. tasks.list did 5 sequential DB round-trips → Promise.all.
7. tasks table had NO indexes → added idx_tasks_customerId/status/assigneeId/dueDate (migration 0023 applied).
8. All routes eagerly imported in App.tsx → route-level lazy loading (code splitting).
9. Added 10s TTL micro-cache in server/db.ts for listCustomers/listInvoices (hot reference lists reused by many procedures per page load) with invalidation on writes (createCustomer/updateCustomer/createInvoice/updateInvoice/deleteVessel/deleteTeamMember/setGroupAccountManager).

## After (measured so far)
| endpoint | time | wire size |
|---|---|---|
| invoices.list | 312ms | 188KB gzipped (was 3169KB) |
| customers.list | 311ms | 74KB gzipped (was 1024KB) |
| customers.groups | 360ms | 44KB gzipped (was 579KB) |
| tasks.list | pending re-measure after Promise.all fix |

## Cookie/session for probes
scripts/profile-endpoints.mjs — mints JWT (openId/appId/name payload) signed with JWT_SECRET, cookie name `app_session_id`.
