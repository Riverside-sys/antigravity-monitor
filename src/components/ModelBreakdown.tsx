import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { CurrencyCode, TokenMode } from '../types';
import type { ModelBreakdownItem } from '../utils/aggregate';
import {
  formatCompactNumber,
  formatCurrency,
  formatNumber,
} from '../utils/format';

interface ModelBreakdownProps {
  models: ModelBreakdownItem[];
  currency: CurrencyCode;
  tokenMode: TokenMode;
}

interface MiniTooltipProps {
  active?: boolean;
  payload?: Array<{
    value?: number;
    payload?: { key: string };
  }>;
  unitLabel: string;
}

function MiniChartTooltip({ active, payload, unitLabel }: MiniTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const point = payload[0];
  return (
    <div className="rounded-xl border border-gray-100 bg-white px-3 py-2 text-xs shadow-[0_8px_24px_rgba(15,23,42,0.10)]">
      <div className="tabular-nums font-medium text-gray-500">
        {point.payload?.key}
      </div>
      <div className="mt-0.5 tabular-nums font-semibold text-gray-900">
        {formatNumber(point.value ?? 0)} {unitLabel}
      </div>
    </div>
  );
}

export function ModelBreakdown({
  models,
  currency,
  tokenMode,
}: ModelBreakdownProps) {
  if (models.length === 0) {
    return null;
  }

  return (
    <section aria-label="Model breakdown" className="space-y-6">
      {models.map((item, idx) => {
        const gradientId = `reqAreaGrad-${idx}`;
        return (
          <div key={item.modelId} className="space-y-3">
            {/* 模型标题行 */}
            <div className="flex flex-wrap items-baseline justify-between gap-2 px-0.5">
              <div className="flex items-baseline gap-2.5">
                <h2 className="text-base font-semibold tracking-tight text-gray-900">
                  {item.displayName}
                </h2>
                <span className="font-mono text-xs text-gray-400">
                  {item.modelId}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span className="tabular-nums">
                  Est. {formatCurrency(item.totalCost, currency)}
                </span>
                {item.errorCount > 0 && (
                  <span className="tabular-nums font-medium text-rose-600">
                    {item.errorCount} failed
                  </span>
                )}
              </div>
            </div>

            {/* 双栏图表卡片 */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* 左栏：Requests 蓝色平滑面积折线图 */}
              <div className="rounded-2xl border border-gray-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
                <div className="mb-4 flex items-baseline gap-2">
                  <span className="text-sm font-medium text-gray-700">
                    Requests
                  </span>
                  <span className="tabular-nums text-sm font-medium text-gray-400">
                    {formatNumber(item.totalRequests)}
                  </span>
                </div>

                <div className="h-[190px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={item.series}
                      margin={{ top: 6, right: 8, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.34} />
                          <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} stroke="#EEF0F3" />
                      <XAxis
                        dataKey="label"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#9CA3AF', fontSize: 11 }}
                        minTickGap={28}
                        dy={4}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#9CA3AF', fontSize: 11 }}
                        width={42}
                        tickCount={3}
                        allowDecimals={false}
                        tickFormatter={(v: number) => formatCompactNumber(v)}
                      />
                      <Tooltip
                        content={<MiniChartTooltip unitLabel="requests" />}
                      />
                      <Area
                        type="monotone"
                        dataKey="requests"
                        stroke="#2563EB"
                        strokeWidth={1.75}
                        fill={`url(#${gradientId})`}
                        isAnimationActive={false}
                        activeDot={{ r: 4, fill: '#2563EB', strokeWidth: 0 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* 右栏：Tokens 浅蓝圆角柱状图 */}
              <div className="rounded-2xl border border-gray-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium text-gray-700">
                      Tokens
                    </span>
                    <span className="tabular-nums text-sm font-medium text-gray-400">
                      {formatNumber(item.totalTokens)}
                    </span>
                  </div>
                  <span className="text-[11px] text-gray-400">
                    {tokenMode === 'total' ? 'With Cache' : 'Non-cached'}
                  </span>
                </div>

                <div className="h-[190px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={item.series}
                      margin={{ top: 6, right: 8, left: 0, bottom: 0 }}
                      barCategoryGap="24%"
                    >
                      <CartesianGrid vertical={false} stroke="#EEF0F3" />
                      <XAxis
                        dataKey="label"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#9CA3AF', fontSize: 11 }}
                        minTickGap={28}
                        dy={4}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#9CA3AF', fontSize: 11 }}
                        width={46}
                        tickCount={3}
                        tickFormatter={(v: number) => formatCompactNumber(v)}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(241, 245, 249, 0.7)' }}
                        content={<MiniChartTooltip unitLabel="tokens" />}
                      />
                      <Bar
                        dataKey="tokens"
                        fill="#93C5FD"
                        maxBarSize={20}
                        radius={[4, 4, 0, 0]}
                        isAnimationActive={false}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}
