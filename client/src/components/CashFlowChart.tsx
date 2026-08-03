/**
 * Cash-flow forecast area chart (Dashboard).
 *
 * Lives in its own module and is loaded lazily: recharts + d3 weigh ~600 KB of
 * the bundle and the chart is only ever shown on the dashboard, below the KPI
 * cards. Keeping it out of the initial chunk lets the rest of the app boot first.
 */
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type CashFlowPoint = {
  name: string;
  "From Invoices": number;
  "From Contracts": number;
};

export default function CashFlowChart({
  data,
  formatValue,
}: {
  data: CashFlowPoint[];
  formatValue: (v: number) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="gInv" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="oklch(0.55 0.14 255)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="oklch(0.55 0.14 255)" stopOpacity={0.03} />
          </linearGradient>
          <linearGradient id="gCon" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="oklch(0.65 0.12 175)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="oklch(0.65 0.12 175)" stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.91 0.006 250)" />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `€${(v / 1000).toFixed(0)}K`} />
        <Tooltip formatter={(v: number) => formatValue(v)} />
        <Legend />
        <Area type="monotone" dataKey="From Invoices" stroke="oklch(0.55 0.14 255)" fill="url(#gInv)" strokeWidth={2} />
        <Area type="monotone" dataKey="From Contracts" stroke="oklch(0.65 0.12 175)" fill="url(#gCon)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
