import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  CurrencyCode,
  TokenMode,
  TrendGroupBy,
  TrendMetric,
} from '../types';
import type { KpiStats, TrendBucket } from '../utils/aggregate';
import { getSeriesColor } from '../utils/chartColors';
import {
  formatCompactNumber,
  formatCurrency,
  formatModelName,
  formatNumber,
  getCurrencySymbol,
} from '../utils/format';

interface MainTrendChartProps {
  trendSeries: TrendBucket[];
  modelKeys: string[];
  projectKeys: string[];
  kpi: KpiStats;
  currency: CurrencyCode;
  tokenMode: TokenMode;
  metric: TrendMetric;
  onMetricChange: (metric: TrendMetric) => void;
  groupBy: TrendGroupBy;
  onGroupByChange: (groupBy: TrendGroupBy) => void;
}

const METRIC_OPTIONS: Array<{ value: TrendMetric; label: string }> = [
  { value: 'cost', label: 'Cost' },
  { value: 'tokens', label: 'Tokens' },
  { value: 'requests', label: 'Requests' },
];

const GROUP_OPTIONS: Array<{ value: TrendGroupBy; label: string }> = [
  { value: 'model', label: 'By Model' },
  { value: 'project', label: 'By Project' },
];

function formatMetricValue(
  value: number,
  metric: TrendMetric,
  currency: CurrencyCode,
): string {
  if (metric === 'cost') {
    return formatCurrency(value, currency);
  }
  return formatNumber(value);
}

function formatYAxisTick(
  value: number,
  metric: TrendMetric,
  currency: CurrencyCode,
): string {
  if (value === 0) return '0';
  if (metric === 'cost') {
    const symbol = getCurrencySymbol(currency);
    if (value < 0.01) return `${symbol}${value.toFixed(3)}`;
    if (value < 1) return `${symbol}${value.toFixed(2)}`;
    if (value < 100) return `${symbol}${Number(value.toFixed(1))}`;
    return `${symbol}${formatCompactNumber(value)}`;
  }
  return formatCompactNumber(value);
}

interface ChartRow {
  key: string;
  label: string;
  __total: number;
  [seriesKey: string]: string | number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    dataKey?: string;
    value?: number;
    color?: string;
    payload?: ChartRow;
  }>;
  metric: TrendMetric;
  groupBy: TrendGroupBy;
  currency: CurrencyCode;
}

function CustomTrendTooltip({
  active,
  payload,
  metric,
  groupBy,
  currency,
}: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const row = payload[0]?.payload;
  if (!row) return null;

  const nonZeroItems = payload
    .filter((item) => typeof item.value === 'number' && item.value > 0)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  return (
    <div className="min-w-[210px] rounded-2xl border border-gray-100 bg-white px-4 py-3.5 shadow-[0_12px_32px_rgba(15,23,42,0.10)]">
      <div className="flex items-center justify-between gap-6">
        <span className="tabular-nums text-sm font-semibold text-gray-900">
          {row.key}
        </span>
        <span className="tabular-nums text-sm font-semibold text-gray-900">
          {formatMetricValue(row.__total ?? 0, metric, currency)}
        </span>
      </div>

      {nonZeroItems.length > 0 ? (
        <div className="mt-2.5 space-y-1.5 border-t border-gray-100 pt-2">
          {nonZeroItems.map((item) => {
            const rawKey = String(item.dataKey ?? '');
            const displayLabel =
              groupBy === 'model' ? formatModelName(rawKey) : rawKey;
            return (
              <div
                key={rawKey}
                className="flex items-center justify-between gap-4 text-xs"
              >
                <span className="flex min-w-0 items-center gap-2 text-gray-600">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                    style={{ backgroundColor: item.color ?? '#3B82F6' }}
                  />
                  <span className="truncate max-w-[160px]">{displayLabel}</span>
                </span>
                <span className="tabular-nums shrink-0 font-medium text-gray-900">
                  {formatMetricValue(item.value ?? 0, metric, currency)}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-1.5 text-xs text-gray-400">No activity</div>
      )}
    </div>
  );
}

interface RoundedTopBarProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  payload?: ChartRow;
  seriesKey: string;
  activeGroupKeys: string[];
}

function StackedRoundedBarShape({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  fill = '#3B82F6',
  payload,
  seriesKey,
  activeGroupKeys,
}: RoundedTopBarProps) {
  if (!height || height <= 0 || !width || width <= 0) {
    return null;
  }

  // 判断当前 segment 是否为该柱最顶部非零段
  let isTop = true;
  if (payload) {
    const idx = activeGroupKeys.indexOf(seriesKey);
    if (idx >= 0) {
      for (let i = idx + 1; i < activeGroupKeys.length; i += 1) {
        const aboveVal = Number(payload[activeGroupKeys[i]] ?? 0);
        if (aboveVal > 0) {
          isTop = false;
          break;
        }
      }
    }
  }

  if (!isTop) {
    return <rect x={x} y={y} width={width} height={height} fill={fill} />;
  }

  const r = Math.min(4, width / 2, height);
  const path = `
    M ${x},${y + height}
    L ${x},${y + r}
    Q ${x},${y} ${x + r},${y}
    L ${x + width - r},${y}
    Q ${x + width},${y} ${x + width},${y + r}
    L ${x + width},${y + height}
    Z
  `;
  return <path d={path} fill={fill} />;
}

export function MainTrendChart({
  trendSeries,
  modelKeys,
  projectKeys,
  kpi,
  currency,
  tokenMode,
  metric,
  onMetricChange,
  groupBy,
  onGroupByChange,
}: MainTrendChartProps) {
  const activeGroupKeys = groupBy === 'model' ? modelKeys : projectKeys;

  const chartData: ChartRow[] = useMemo(() => {
    return trendSeries.map((bucket) => {
      const sourceMap = groupBy === 'model' ? bucket.byModel : bucket.byProject;
      const row: ChartRow = {
        key: bucket.key,
        label: bucket.label,
        __total: bucket.total[metric],
      };
      for (const gKey of activeGroupKeys) {
        row[gKey] = sourceMap[gKey]?.[metric] ?? 0;
      }
      return row;
    });
  }, [trendSeries, groupBy, activeGroupKeys, metric]);

  const headerTitle =
    metric === 'cost'
      ? `Cost (${currency})`
      : metric === 'tokens'
        ? `Tokens (${tokenMode === 'total' ? 'With Cache' : 'Non-cached'})`
        : 'Model Requests';

  const headerValue =
    metric === 'cost'
      ? formatCurrency(kpi.totalCost, currency)
      : metric === 'tokens'
        ? formatNumber(kpi.displayTokens)
        : formatNumber(kpi.totalRequests);

  return (
    <section
      aria-label="Usage trend chart"
      className="rounded-2xl border border-gray-200/70 bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.03)]"
    >
      {/* 顶部标题与双胶囊切换 */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2.5">
          <span className="text-sm font-medium text-gray-700">{headerTitle}</span>
          <span className="tabular-nums text-sm font-semibold text-gray-500">
            {headerValue}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* 指标胶囊 */}
          <div
            role="group"
            aria-label="Trend metric"
            className="flex items-center rounded-full bg-[#ECEEF2] p-0.5 text-xs font-medium"
          >
            {METRIC_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onMetricChange(opt.value)}
                className={`cursor-pointer rounded-full px-3 py-1 transition-all ${
                  metric === opt.value
                    ? 'bg-white text-gray-900 shadow-xs'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* 分组胶囊 */}
          <div
            role="group"
            aria-label="Trend group by"
            className="flex items-center rounded-full bg-[#ECEEF2] p-0.5 text-xs font-medium"
          >
            {GROUP_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onGroupByChange(opt.value)}
                className={`cursor-pointer rounded-full px-3 py-1 transition-all ${
                  groupBy === opt.value
                    ? 'bg-white text-gray-900 shadow-xs'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 堆叠柱状图 */}
      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            barCategoryGap="24%"
          >
            <CartesianGrid vertical={false} stroke="#EEF0F3" />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#9CA3AF', fontSize: 12 }}
              minTickGap={24}
              dy={6}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#9CA3AF', fontSize: 12 }}
              width={54}
              tickCount={4}
              tickFormatter={(v: number) => formatYAxisTick(v, metric, currency)}
            />
            <Tooltip
              cursor={{ fill: 'rgba(241, 245, 249, 0.7)' }}
              content={
                <CustomTrendTooltip
                  metric={metric}
                  groupBy={groupBy}
                  currency={currency}
                />
              }
            />
            {activeGroupKeys.length > 0 ? (
              activeGroupKeys.map((gKey, index) => {
                const color = getSeriesColor(index);
                return (
                  <Bar
                    key={gKey}
                    dataKey={gKey}
                    stackId="trend"
                    fill={color}
                    maxBarSize={24}
                    isAnimationActive={false}
                    shape={(barProps: unknown) => {
                      const bp = barProps as RoundedTopBarProps;
                      return (
                        <StackedRoundedBarShape
                          {...bp}
                          fill={color}
                          seriesKey={gKey}
                          activeGroupKeys={activeGroupKeys}
                        />
                      );
                    }}
                  />
                );
              })
            ) : (
              <Bar
                dataKey="__total"
                fill="#3B82F6"
                maxBarSize={24}
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 精简图例 */}
      {activeGroupKeys.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-gray-100 pt-3">
          {activeGroupKeys.map((gKey, index) => (
            <div
              key={gKey}
              className="flex items-center gap-1.5 text-xs text-gray-600"
            >
              <span
                className="h-2.5 w-2.5 rounded-[3px]"
                style={{ backgroundColor: getSeriesColor(index) }}
              />
              <span>{groupBy === 'model' ? formatModelName(gKey) : gKey}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
