import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { CurrencyCode, TokenMode } from '../types';
import type { SessionBreakdownRow } from '../utils/aggregate';
import {
  formatCurrency,
  formatDateTime,
  formatNumber,
  formatPercent,
} from '../utils/format';

interface TopSessionsTableProps {
  sessions: SessionBreakdownRow[];
  currency: CurrencyCode;
  tokenMode: TokenMode;
}

const DEFAULT_LIMIT = 20;

export function TopSessionsTable({
  sessions,
  currency,
  tokenMode,
}: TopSessionsTableProps) {
  const [showAll, setShowAll] = useState(false);

  if (sessions.length === 0) {
    return null;
  }

  const visibleRows = showAll ? sessions : sessions.slice(0, DEFAULT_LIMIT);
  const hasMore = sessions.length > DEFAULT_LIMIT;

  return (
    <section
      aria-label="Top sessions"
      className="rounded-2xl border border-gray-200/70 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.03)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-6 py-4">
        <div className="flex items-baseline gap-2.5">
          <h2 className="text-sm font-semibold text-gray-900">Top Sessions</h2>
          <span className="text-xs text-gray-400">
            按{tokenMode === 'total' ? '含缓存总 Token' : '非缓存 Token'}排序 · 共{' '}
            {sessions.length} 个会话
          </span>
        </div>

        {hasMore && (
          <button
            type="button"
            onClick={() => setShowAll((prev) => !prev)}
            className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-200 hover:text-gray-900"
          >
            {showAll ? (
              <>
                <span>收起至 Top {DEFAULT_LIMIT}</span>
                <ChevronUp className="h-3.5 w-3.5" />
              </>
            ) : (
              <>
                <span>查看全部 {sessions.length} 个</span>
                <ChevronDown className="h-3.5 w-3.5" />
              </>
            )}
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs font-medium text-gray-400">
              <th className="py-3 pl-6 pr-3">Session</th>
              <th className="px-3 py-3">Project</th>
              <th className="px-3 py-3">Primary Model</th>
              <th className="px-3 py-3 text-right">Requests</th>
              <th className="px-3 py-3 text-right">Non-cached</th>
              <th className="px-3 py-3 text-right">Cache Read</th>
              <th className="px-3 py-3 text-right">Hit Rate</th>
              <th className="px-3 py-3 text-right">Est. Cost</th>
              <th className="py-3 pl-3 pr-6 text-right">Last Active</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100/80 text-xs text-gray-700">
            {visibleRows.map((row) => {
              const isOutside = row.projectName === 'Outside of Project';
              return (
                <tr
                  key={row.sessionId}
                  className="transition-colors hover:bg-[#F9FAFB]"
                >
                  <td className="max-w-[260px] py-3.5 pl-6 pr-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="truncate font-medium text-gray-900"
                        title={`${row.title} (${row.sessionId})`}
                      >
                        {row.title}
                      </span>
                      {row.errorCount > 0 && (
                        <span
                          className="shrink-0 rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-600"
                          title={`${row.errorCount} errors`}
                        >
                          {row.errorCount} err
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="px-3 py-3.5">
                    <span
                      className={`inline-block max-w-[150px] truncate rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                        isOutside
                          ? 'bg-gray-100 text-gray-500'
                          : 'bg-blue-50 text-blue-700'
                      }`}
                      title={row.projectName}
                    >
                      {row.projectName}
                    </span>
                  </td>

                  <td className="px-3 py-3.5 text-gray-600">
                    <span className="whitespace-nowrap">{row.primaryModelName}</span>
                  </td>

                  <td className="tabular-nums px-3 py-3.5 text-right font-medium text-gray-800">
                    {formatNumber(row.requests)}
                  </td>

                  <td
                    className={`tabular-nums px-3 py-3.5 text-right ${
                      tokenMode === 'non_cached'
                        ? 'font-semibold text-gray-900'
                        : 'text-gray-600'
                    }`}
                  >
                    {formatNumber(row.nonCachedTokens)}
                  </td>

                  <td
                    className={`tabular-nums px-3 py-3.5 text-right ${
                      tokenMode === 'total'
                        ? 'font-semibold text-gray-900'
                        : 'text-gray-600'
                    }`}
                  >
                    {formatNumber(row.cacheReadTokens)}
                  </td>

                  <td className="tabular-nums px-3 py-3.5 text-right text-gray-600">
                    {formatPercent(row.cacheHitRate)}
                  </td>

                  <td className="tabular-nums px-3 py-3.5 text-right font-medium text-gray-900">
                    {formatCurrency(row.estimatedCost, currency)}
                  </td>

                  <td className="tabular-nums whitespace-nowrap py-3.5 pl-3 pr-6 text-right text-gray-400">
                    {formatDateTime(row.lastActiveAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
