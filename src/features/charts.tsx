import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CategoryTotal, MonthSummary } from "@/domain/aggregate";
import type { CategorySeries } from "@/domain/stats";
import { monthLabel } from "@/domain/months";
import { SERIES_COLORS } from "@/domain/defaults";
import { formatCompact, formatMoney, formatPercent } from "@/lib/format";

const AXIS = { fontSize: 11, fill: "#69675f" };

function TooltipBox({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="min-w-44 rounded-lg bg-display px-3 py-2.5 text-xs text-display-dim shadow-[0_12px_28px_-8px_rgb(20_20_18/0.5)]">
      <p className="mb-1.5 font-semibold text-display-ink">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-2 py-px">
          {r.color && <span className="size-2 rounded-full" style={{ background: r.color }} />}
          <span className="flex-1">{r.label}</span>
          <span className="num font-semibold text-display-ink">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Seskupené sloupce příjmy vs. výdaje po měsících. */
export function IncomeExpenseChart({
  data,
  currency,
  highlight,
  height = 240,
}: {
  data: MonthSummary[];
  currency: string;
  highlight?: string;
  height?: number;
}) {
  const rows = data.map((d) => ({ ...d, label: monthLabel(d.month, { short: true, withYear: false }) }));
  return (
    <div>
      <Legend
        items={[
          { label: "Příjmy", color: SERIES_COLORS.income },
          { label: "Výdaje", color: SERIES_COLORS.expense },
        ]}
      />
      <div style={{ height }} className="mt-3">
        <ResponsiveContainer>
          <BarChart data={rows} barGap={2} barCategoryGap="28%" margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="#ebeae5" />
            <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} width={56} tickFormatter={formatCompact} />
            <Tooltip
              cursor={{ fill: "rgb(30 29 27 / 0.05)" }}
              content={({ active, payload }) => {
                const d = active && payload?.[0]?.payload as (MonthSummary & { label: string }) | undefined;
                if (!d) return null;
                return (
                  <TooltipBox
                    title={monthLabel(d.month)}
                    rows={[
                      { label: "Příjmy", value: formatMoney(d.income, currency), color: SERIES_COLORS.income },
                      { label: "Výdaje", value: formatMoney(d.expense, currency), color: SERIES_COLORS.expense },
                      { label: "Bilance", value: formatMoney(d.net, currency, { signed: true }) },
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="income" name="Příjmy" radius={[2, 2, 0, 0]} maxBarSize={28} isAnimationActive={false}>
              {rows.map((r) => (
                <Cell key={r.month} fill={SERIES_COLORS.income} fillOpacity={!highlight || r.month === highlight ? 1 : 0.55} />
              ))}
            </Bar>
            <Bar dataKey="expense" name="Výdaje" radius={[2, 2, 0, 0]} maxBarSize={28} isAnimationActive={false}>
              {rows.map((r) => (
                <Cell key={r.month} fill={SERIES_COLORS.expense} fillOpacity={!highlight || r.month === highlight ? 1 : 0.55} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const MAX_SLICES = 7;
const OTHER_COLOR = "#8c8a81";

/** Paleta má 8 slotů – menší kategorie se slučují do „Další“, barvy se nikdy necyklí. */
export function foldCategories(items: CategoryTotal[]): CategoryTotal[] {
  if (items.length <= MAX_SLICES + 1) return items;
  const head = items.slice(0, MAX_SLICES);
  const tail = items.slice(MAX_SLICES);
  return [
    ...head,
    {
      categoryId: "__rest",
      name: `Další (${tail.length})`,
      color: OTHER_COLOR,
      total: tail.reduce((s, c) => s + c.total, 0),
      share: tail.reduce((s, c) => s + c.share, 0),
    },
  ];
}

export function CategoryDonut({ items, currency }: { items: CategoryTotal[]; currency: string }) {
  const data = foldCategories(items);
  const total = items.reduce((s, c) => s + c.total, 0);
  return (
    <div className="@container">
    <div className="flex flex-col items-center gap-5 @md:flex-row">
      <div className="relative size-44 shrink-0">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={data}
              dataKey="total"
              nameKey="name"
              innerRadius="68%"
              outerRadius="100%"
              paddingAngle={data.length > 1 ? 1.5 : 0}
              stroke="#fff"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {data.map((d) => (
                <Cell key={d.categoryId ?? "none"} fill={d.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                const d = active && (payload?.[0]?.payload as CategoryTotal | undefined);
                if (!d) return null;
                return <TooltipBox title={d.name} rows={[{ label: formatPercent(d.share), value: formatMoney(d.total, currency) }]} />;
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] text-slate-500">Celkem</span>
          <span className="num text-sm font-semibold">{formatMoney(total, currency)}</span>
        </div>
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-2 text-sm">
        {data.map((d) => (
          <li key={d.categoryId ?? "none"} className="flex items-center gap-2">
            <span className="size-2 shrink-0 rounded-full" style={{ background: d.color }} />
            <span className="flex-1 truncate text-slate-700">{d.name}</span>
            <span className="num w-12 text-right text-xs text-slate-500">{formatPercent(d.share, { digits: 0 })}</span>
            <span className="num w-24 text-right font-medium">{formatMoney(d.total, currency)}</span>
          </li>
        ))}
      </ul>
    </div>
    </div>
  );
}

/** Kategorie jako úměrné pruhy na společné stupnici – nejvyšší výdaj = plná délka. */
export function CategoryBars({ items, currency }: { items: CategoryTotal[]; currency: string }) {
  const data = foldCategories(items);
  const max = Math.max(...data.map((d) => d.total), 1);
  return (
    <ul className="space-y-3.5">
      {data.map((d) => (
        <li key={d.categoryId ?? "none"}>
          <div className="flex items-baseline gap-3 text-sm">
            <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{d.name}</span>
            <span className="num text-xs text-slate-500">{formatPercent(d.share, { digits: 0 })}</span>
            <span className="num w-24 text-right font-semibold text-slate-900">{formatMoney(d.total, currency)}</span>
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-slate-100 shadow-well">
            <div className="h-full rounded-full" style={{ width: `${Math.max((d.total / max) * 100, 1.5)}%`, background: d.color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Příjmy a výdaje jako sloupce, úspora jako čára – vše ve stejných jednotkách na jedné ose. */
export function TrendChart({ data, currency, height = 300 }: { data: MonthSummary[]; currency: string; height?: number }) {
  const shortYear = data.length > 12;
  // Měsíce bez dat nejsou nulová úspora – čára se v nich přeruší.
  const rows = data.map((d) => (d.transactionCount ? d : { ...d, net: null }));
  return (
    <div>
      <Legend
        items={[
          { label: "Příjmy", color: SERIES_COLORS.income },
          { label: "Výdaje", color: SERIES_COLORS.expense },
          { label: "Úspora", color: SERIES_COLORS.net },
        ]}
      />
      <div style={{ height }} className="mt-3">
        <ResponsiveContainer>
          <ComposedChart data={rows} barGap={2} barCategoryGap="24%" margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="#ebeae5" />
            <XAxis
              dataKey="month"
              tick={AXIS}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              tickFormatter={(m: string) => (shortYear ? `${monthLabel(m, { short: true, withYear: false })} ${m.slice(2, 4)}` : monthLabel(m, { short: true, withYear: false }))}
            />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} width={56} tickFormatter={formatCompact} />
            <ReferenceLine y={0} stroke="#c6c4bc" />
            <Tooltip
              cursor={{ fill: "rgb(30 29 27 / 0.05)" }}
              content={({ active, payload }) => {
                const d = active && (payload?.[0]?.payload as MonthSummary | undefined);
                if (!d) return null;
                if (!d.transactionCount) return <TooltipBox title={monthLabel(d.month)} rows={[{ label: "Bez dat", value: "" }]} />;
                return (
                  <TooltipBox
                    title={monthLabel(d.month)}
                    rows={[
                      { label: "Příjmy", value: formatMoney(d.income, currency), color: SERIES_COLORS.income },
                      { label: "Výdaje", value: formatMoney(d.expense, currency), color: SERIES_COLORS.expense },
                      { label: "Úspora", value: formatMoney(d.net, currency, { signed: true }), color: SERIES_COLORS.net },
                      { label: "Míra úspor", value: d.savingsRate === null ? "—" : formatPercent(d.savingsRate) },
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="income" fill={SERIES_COLORS.income} radius={[2, 2, 0, 0]} maxBarSize={22} isAnimationActive={false} />
            <Bar dataKey="expense" fill={SERIES_COLORS.expense} radius={[2, 2, 0, 0]} maxBarSize={22} isAnimationActive={false} />
            <Line
              dataKey="net"
              stroke={SERIES_COLORS.net}
              strokeWidth={2}
              dot={{ r: 3, fill: SERIES_COLORS.net, stroke: "#fff", strokeWidth: 2 }}
              activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Skládané sloupce výdajů podle kategorií v čase. */
export function CategoryStackChart({ series, currency, height = 300 }: { series: CategorySeries; currency: string; height?: number }) {
  const shortYear = series.rows.length > 12;
  return (
    <div>
      <Legend items={series.keys.map((k) => ({ label: k.name, color: k.color }))} />
      <div style={{ height }} className="mt-3">
        <ResponsiveContainer>
          <BarChart data={series.rows} barCategoryGap="24%" margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="#ebeae5" />
            <XAxis
              dataKey="month"
              tick={AXIS}
              axisLine={false}
              tickLine={false}
              tickFormatter={(m: string) => (shortYear ? `${monthLabel(m, { short: true, withYear: false })} ${m.slice(2, 4)}` : monthLabel(m, { short: true, withYear: false }))}
            />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} width={56} tickFormatter={formatCompact} />
            <Tooltip
              cursor={{ fill: "rgb(30 29 27 / 0.05)" }}
              content={({ active, payload }) => {
                const row = active && (payload?.[0]?.payload as Record<string, number | string> | undefined);
                if (!row) return null;
                const total = series.keys.reduce((a, k) => a + (row[k.id] as number), 0);
                return (
                  <TooltipBox
                    title={monthLabel(row.month as string)}
                    rows={[
                      ...series.keys
                        .filter((k) => (row[k.id] as number) > 0)
                        .map((k) => ({ label: k.name, value: formatMoney(row[k.id] as number, currency), color: k.color })),
                      { label: "Celkem", value: formatMoney(total, currency) },
                    ]}
                  />
                );
              }}
            />
            {series.keys.map((k, i) => (
              <Bar
                key={k.id}
                dataKey={k.id}
                stackId="c"
                fill={k.color}
                stroke="#fff"
                strokeWidth={1}
                maxBarSize={36}
                radius={i === series.keys.length - 1 ? [4, 4, 0, 0] : 0}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export interface LineSeries {
  key: string;
  name: string;
  color: string;
  dashed?: boolean;
}

/** Více čar ve stejných jednotkách (např. zůstatky účtů). Řádek = { month, [key]: hodnota }. */
export function MultiLineChart({
  rows,
  series,
  currency,
  height = 260,
}: {
  rows: { month: string }[];
  series: LineSeries[];
  currency: string;
  height?: number;
}) {
  const shortYear = rows.length > 12;
  return (
    <div>
      {series.length > 1 && <Legend items={series.map((s) => ({ label: s.name, color: s.color }))} />}
      <div style={{ height }} className="mt-3">
        <ResponsiveContainer>
          <LineChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="#ebeae5" />
            <XAxis
              dataKey="month"
              tick={AXIS}
              axisLine={false}
              tickLine={false}
              tickFormatter={(m: string) => `${monthLabel(m, { short: true, withYear: false })}${shortYear ? ` ${m.slice(2, 4)}` : ""}`}
            />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} width={56} tickFormatter={formatCompact} />
            <ReferenceLine y={0} stroke="#c6c4bc" />
            <Tooltip
              content={({ active, payload }) => {
                const row = active && (payload?.[0]?.payload as Record<string, number | string | null> | undefined);
                if (!row) return null;
                return (
                  <TooltipBox
                    title={monthLabel(row.month as string)}
                    rows={series
                      .filter((s) => row[s.key] !== null && row[s.key] !== undefined)
                      .map((s) => ({ label: s.name, value: formatMoney(row[s.key] as number, currency), color: s.color }))}
                  />
                );
              }}
            />
            {series.map((s) => (
              <Line
                key={s.key}
                dataKey={s.key}
                stroke={s.color}
                strokeWidth={2}
                strokeDasharray={s.dashed ? "5 4" : undefined}
                dot={false}
                activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Měsíční cashflow (kladné/záporné sloupce) + kumulativní čára. */
export function CashflowChart({ data, currency, height = 260 }: { data: { month: string; net: number; cumulative: number; transactionCount: number }[]; currency: string; height?: number }) {
  const shortYear = data.length > 12;
  return (
    <div>
      <Legend
        items={[
          { label: "Kladné cashflow", color: SERIES_COLORS.income },
          { label: "Záporné cashflow", color: SERIES_COLORS.expense },
          { label: "Kumulativně", color: SERIES_COLORS.net },
        ]}
      />
      <div style={{ height }} className="mt-3">
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="#ebeae5" />
            <XAxis
              dataKey="month"
              tick={AXIS}
              axisLine={false}
              tickLine={false}
              tickFormatter={(m: string) => `${monthLabel(m, { short: true, withYear: false })}${shortYear ? ` ${m.slice(2, 4)}` : ""}`}
            />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} width={56} tickFormatter={formatCompact} />
            <ReferenceLine y={0} stroke="#8c8a81" />
            <Tooltip
              cursor={{ fill: "rgb(30 29 27 / 0.05)" }}
              content={({ active, payload }) => {
                const d = active && (payload?.[0]?.payload as { month: string; net: number; cumulative: number } | undefined);
                if (!d) return null;
                return (
                  <TooltipBox
                    title={monthLabel(d.month)}
                    rows={[
                      { label: "Cashflow", value: formatMoney(d.net, currency, { signed: true }), color: d.net >= 0 ? SERIES_COLORS.income : SERIES_COLORS.expense },
                      { label: "Kumulativně", value: formatMoney(d.cumulative, currency, { signed: true }), color: SERIES_COLORS.net },
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="net" maxBarSize={28} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.month} fill={d.net >= 0 ? SERIES_COLORS.income : SERIES_COLORS.expense} radius={(d.net >= 0 ? [4, 4, 0, 0] : [0, 0, 4, 4]) as never} />
              ))}
            </Bar>
            <Line dataKey="cumulative" stroke={SERIES_COLORS.net} strokeWidth={2} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export interface ForecastRow {
  month: string;
  income?: number | null;
  expense?: number | null;
  incomeForecast?: number | null;
  expenseForecast?: number | null;
  incomeRange?: [number, number] | null;
  expenseRange?: [number, number] | null;
}

/**
 * Skutečnost (plná čára) vs. odhad (přerušovaná čára + pásmo ≈80% intervalu).
 * Hranice mezi historií a odhadem je vyznačena svislou čarou.
 */
export function ForecastChart({ rows, currency, boundary, height = 300 }: { rows: ForecastRow[]; currency: string; boundary: string; height?: number }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
        <Legend
          items={[
            { label: "Příjmy", color: SERIES_COLORS.income },
            { label: "Výdaje", color: SERIES_COLORS.expense },
          ]}
        />
        <span className="inline-flex items-center gap-1.5">
          <svg width="20" height="4" aria-hidden><line x1="0" y1="2" x2="20" y2="2" stroke="#69675f" strokeWidth="2" /></svg> skutečnost
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="20" height="4" aria-hidden><line x1="0" y1="2" x2="20" y2="2" stroke="#69675f" strokeWidth="2" strokeDasharray="4 3" /></svg> odhad
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm bg-slate-300/60" /> pravděpodobný rozsah
        </span>
      </div>
      <div style={{ height }} className="mt-3">
        <ResponsiveContainer>
          <ComposedChart data={rows} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="#ebeae5" />
            <XAxis
              dataKey="month"
              tick={AXIS}
              axisLine={false}
              tickLine={false}
              tickFormatter={(m: string) => `${monthLabel(m, { short: true, withYear: false })}${rows.length > 12 ? ` ${m.slice(2, 4)}` : ""}`}
            />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} width={56} tickFormatter={formatCompact} />
            <ReferenceLine x={boundary} stroke="#8c8a81" strokeDasharray="3 3" label={{ value: "odhad", position: "insideTopRight", fontSize: 11, fill: "#69675f" }} />
            <Tooltip
              content={({ active, payload }) => {
                const d = active && (payload?.[0]?.payload as ForecastRow | undefined);
                if (!d) return null;
                const rowsOut: { label: string; value: string; color?: string }[] = [];
                if (d.income != null) rowsOut.push({ label: "Příjmy", value: formatMoney(d.income, currency), color: SERIES_COLORS.income });
                if (d.expense != null) rowsOut.push({ label: "Výdaje", value: formatMoney(d.expense, currency), color: SERIES_COLORS.expense });
                if (d.incomeRange && d.income == null)
                  rowsOut.push({ label: "Příjmy – odhad", value: `${formatMoney(d.incomeRange[0], currency)} – ${formatMoney(d.incomeRange[1], currency)}`, color: SERIES_COLORS.income });
                if (d.expenseRange && d.expense == null)
                  rowsOut.push({ label: "Výdaje – odhad", value: `${formatMoney(d.expenseRange[0], currency)} – ${formatMoney(d.expenseRange[1], currency)}`, color: SERIES_COLORS.expense });
                return <TooltipBox title={monthLabel(d.month)} rows={rowsOut} />;
              }}
            />
            <Area dataKey="incomeRange" stroke="none" fill={SERIES_COLORS.income} fillOpacity={0.15} isAnimationActive={false} connectNulls={false} />
            <Area dataKey="expenseRange" stroke="none" fill={SERIES_COLORS.expense} fillOpacity={0.15} isAnimationActive={false} connectNulls={false} />
            <Line dataKey="income" stroke={SERIES_COLORS.income} strokeWidth={2} dot={{ r: 2.5, fill: SERIES_COLORS.income }} isAnimationActive={false} connectNulls={false} />
            <Line dataKey="expense" stroke={SERIES_COLORS.expense} strokeWidth={2} dot={{ r: 2.5, fill: SERIES_COLORS.expense }} isAnimationActive={false} connectNulls={false} />
            <Line dataKey="incomeForecast" stroke={SERIES_COLORS.income} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
            <Line dataKey="expenseForecast" stroke={SERIES_COLORS.expense} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
