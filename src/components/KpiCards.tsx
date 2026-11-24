import type { CurrencyCode, KpiViewMode, TokenMode } from '../types';
import type { KpiStats } from '../utils/aggregate';
import {
  formatCompactNumber,
  formatCurrency,
  formatNumber,
  formatPercent,
} from '../utils/format';

interface KpiCardsProps {
  kpi: KpiStats;
  currency: CurrencyCode;
  tokenMode: TokenMode;
  kpiView: KpiViewMode;
}

export function KpiCards({ kpi, currency, tokenMode, kpiView }: KpiCardsProps) {
  const showCost = kpiView === 'all' || kpiView === 'cost';
  const showCache = kpiView === 'all' || kpiView === 'cache';
  const cardCount = (showCost ? 1 : 0) + (showCache ? 1 : 0) + 2;

  const gridColsClass =
    cardCount === 4
      ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4'
      : 'grid-cols-1 md:grid-cols-3';

  const inputPct = Math.round(kpi.inputShare * 1000) / 10;
  const outputPct = Math.round(kpi.outputShare * 1000) / 10;
  const cachePct = Math.max(0, Math.round((100 - inputPct - outputPct) * 10) / 10);
  const hasAnyToken = kpi.totalWithCacheTokens > 0;

  return (
    <section
      aria-label="Key performance indicators"
      className={`grid gap-4 ${gridColsClass}`}
    >
      {showCost && (
        <div className="flex flex-col justify-between rounded-2xl border border-gray-200/70 bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
          <div>
            <div className="text-sm font-medium text-gray-500">Estimated Cost</div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="tabular-nums text-[30px] leading-tight font-semibold tracking-tight text-gray-900">
                {formatCurrency(kpi.totalCost, currency)}
              </span>
              <span className="text-sm font-normal text-gray-400">{currency}</span>
            </div>
          </div>
          <div className="mt-3 text-xs text-gray-500">
            缓存已节省{' '}
            <span className="tabular-nums font-medium text-emerald-600">
              {formatCurrency(kpi.totalCacheSaved, currency)}
            </span>
          </div>
        </div>
      )}

      {showCache && (
        <div className="flex flex-col justify-between rounded-2xl border border-gray-200/70 bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
          <div>
            <div className="text-sm font-medium text-gray-500">Cache & Activity</div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="tabular-nums text-[30px] leading-tight font-semibold tracking-tight text-gray-900">
                {formatPercent(kpi.cacheHitRate)}
              </span>
              <span className="text-sm font-normal text-gray-400">hit rate</span>
            </div>
          </div>
          <div className="mt-3 text-xs text-gray-500">
            <span className="tabular-nums font-medium text-gray-700">
              {formatNumber(kpi.activeSessions)}
            </span>{' '}
            个活跃会话 ·{' '}
            <span className="tabular-nums font-medium text-gray-700">
              {formatNumber(kpi.coveredProjects)}
            </span>{' '}
            个项目
          </div>
        </div>
      )}

      <div className="flex flex-col justify-between rounded-2xl border border-gray-200/70 bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
        <div>
          <div className="text-sm font-medium text-gray-500">Model Requests</div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="tabular-nums text-[30px] leading-tight font-semibold tracking-tight text-gray-900">
              {formatNumber(kpi.totalRequests)}
            </span>
            <span className="text-sm font-normal text-gray-400">requests</span>
          </div>
        </div>
        <div className="mt-3 text-xs">
          {kpi.errorCount > 0 ? (
            <span className="tabular-nums font-medium text-rose-600">
              {formatNumber(kpi.errorCount)} failed
            </span>
          ) : (
            <span className="tabular-nums text-gray-400">0 errors</span>
          )}
        </div>
      </div>

      <div className="flex flex-col justify-between rounded-2xl border border-gray-200/70 bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-gray-500">Tokens</span>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
              {tokenMode === 'total' ? 'With Cache' : 'Non-cached'}
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="tabular-nums text-[30px] leading-tight font-semibold tracking-tight text-gray-900">
              {formatNumber(kpi.displayTokens)}
            </span>
          </div>
        </div>

        {/* Input / Output / Cache 分项比例条 */}
        <div className="mt-3 space-y-1.5">
          <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            {hasAnyToken && (
              <>
                <div
                  style={{ width: `${inputPct}%` }}
                  className="bg-blue-500 transition-all duration-300"
                  title={`Input: ${formatNumber(kpi.inputTokens)}`}
                />
                <div
                  style={{ width: `${outputPct}%` }}
                  className="bg-indigo-500 transition-all duration-300"
                  title={`Output: ${formatNumber(kpi.outputTokens)}`}
                />
                <div
                  style={{ width: `${cachePct}%` }}
                  className="bg-sky-300 transition-all duration-300"
                  title={`Cache Read: ${formatNumber(kpi.cacheReadTokens)}`}
                />
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              In{' '}
              <span className="tabular-nums font-medium text-gray-700">
                {formatCompactNumber(kpi.inputTokens)}
              </span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
              Out{' '}
              <span className="tabular-nums font-medium text-gray-700">
                {formatCompactNumber(kpi.outputTokens)}
              </span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-300" />
              Cache{' '}
              <span className="tabular-nums font-medium text-gray-700">
                {formatCompactNumber(kpi.cacheReadTokens)}
              </span>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
