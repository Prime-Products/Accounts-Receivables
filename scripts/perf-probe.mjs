import { appRouter } from '/home/ubuntu/ar_app/server/routers.ts';
const caller = appRouter.createCaller({ user: { id: 1, openId: 'test-open-id', role: 'admin', name: 'Perf' } });
const jobs = [
  ['customers.groups', () => caller.customers.groups()],
  ['customers.list', () => caller.customers.list({})],
  ['forecast.dashboard', () => caller.forecast.dashboard()],
  ['tasks.list', () => caller.tasks.list({})],
  ['invoices.list', () => caller.invoices.list({})],
  ['addressBook.contacts', () => caller.addressBook.contacts()],
  ['addressBook.groups', () => caller.addressBook.groups()],
  ['forecast.smartEntries', () => caller.forecast.smartEntries({ year: 2026, month: 8 })],
  ['reports.aging', () => caller.reports.aging({})],
];
for (const [name, fn] of jobs) {
  try {
    const t = Date.now();
    const r = await fn();
    const size = JSON.stringify(r).length;
    console.log(`${name.padEnd(24)} ${String(Date.now()-t).padStart(6)}ms  payload ${(size/1024).toFixed(0)} KB  rows ${Array.isArray(r)?r.length:(r?.rows?.length ?? '-')}`);
  } catch (e) {
    console.log(`${name.padEnd(24)} ERROR ${e.message.slice(0,120)}`);
  }
}
process.exit(0);
