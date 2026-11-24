import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Download,
  FileJson,
  FileSpreadsheet,
  FolderCog,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react';
import type {
  CurrencyCode,
  KpiViewMode,
  TimeRangePreset,
  TokenMode,
} from '../types';
import { formatTimeOnly } from '../utils/format';

interface TopBarProps {
  timeRange: TimeRangePreset;
  onTimeRangeChange: (value: TimeRangePreset) => void;
  customStartDate: string;
  customEndDate: string;
  onCustomStartDateChange: (value: string) => void;
  onCustomEndDateChange: (value: string) => void;
  projects: string[];
  selectedProject: string;
  onProjectChange: (value: string) => void;
  tokenMode: TokenMode;
  onTokenModeChange: (value: TokenMode) => void;
  kpiView: KpiViewMode;
  onKpiViewChange: (value: KpiViewMode) => void;
  autoRefresh: boolean;
  onAutoRefreshToggle: () => void;
  onManualRefresh: () => void;
  isRefreshing: boolean;
  lastUpdatedAt: string;
  currency: CurrencyCode;
  dataRoot?: string;
  onOpenDataDir: () => void;
  onOpenPricing: () => void;
  onExportCsv: () => void;
  onExportJson: () => void;
  hasData: boolean;
}

const TIME_OPTIONS: Array<{ value: TimeRangePreset; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom' },
];

const KPI_VIEW_OPTIONS: Array<{ value: KpiViewMode; label: string }> = [
  { value: 'all', label: 'All KPIs' },
  { value: 'cost', label: 'Cost' },
  { value: 'cache', label: 'Cache' },
];

export function TopBar({
  timeRange,
  onTimeRangeChange,
  customStartDate,
  customEndDate,
  onCustomStartDateChange,
  onCustomEndDateChange,
  projects,
  selectedProject,
  onProjectChange,
  tokenMode,
  onTokenModeChange,
  kpiView,
  onKpiViewChange,
  autoRefresh,
  onAutoRefreshToggle,
  onManualRefresh,
  isRefreshing,
  lastUpdatedAt,
  currency,
  dataRoot,
  onOpenDataDir,
  onOpenPricing,
  onExportCsv,
  onExportJson,
  hasData,
}: TopBarProps) {
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [exportMenuOpen]);

  const timeLabel = TIME_OPTIONS.find((t) => t.value === timeRange)?.label ?? 'Last 7 days';

  return (
    <header className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* 左侧胶囊筛选器（参考设计图极简风格） */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Time 胶囊 */}
          <div className="relative flex h-9 items-center rounded-full border border-gray-200/80 bg-white px-3.5 text-sm shadow-[0_1px_2px_rgba(16,24,40,0.03)] transition-colors hover:border-gray-300">
            <span className="text-xs font-medium text-gray-400">Time</span>
            <span className="mx-2.5 h-3.5 w-px bg-gray-200" aria-hidden="true" />
            <div className="relative flex items-center">
              <select
                aria-label="Time range"
                value={timeRange}
                onChange={(e) => onTimeRangeChange(e.target.value as TimeRangePreset)}
                className="cursor-pointer appearance-none bg-transparent pr-5 text-sm font-medium text-gray-900 focus:outline-none"
              >
                {TIME_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-0 h-3.5 w-3.5 text-gray-400" />
            </div>
          </div>

          {/* Custom 日期范围（选中 Custom 时内联展开） */}
          {timeRange === 'custom' && (
            <div className="flex h-9 items-center gap-1.5 rounded-full border border-gray-200/80 bg-white px-3 text-xs shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
              <input
                type="date"
                aria-label="Custom start date"
                value={customStartDate}
                onChange={(e) => onCustomStartDateChange(e.target.value)}
                className="cursor-pointer bg-transparent font-medium text-gray-800 focus:outline-none"
              />
              <span className="text-gray-400">→</span>
              <input
                type="date"
                aria-label="Custom end date"
                value={customEndDate}
                onChange={(e) => onCustomEndDateChange(e.target.value)}
                className="cursor-pointer bg-transparent font-medium text-gray-800 focus:outline-none"
              />
            </div>
          )}

          {/* Project 胶囊 */}
          <div className="relative flex h-9 items-center rounded-full border border-gray-200/80 bg-white px-3.5 text-sm shadow-[0_1px_2px_rgba(16,24,40,0.03)] transition-colors hover:border-gray-300">
            <span className="text-xs font-medium text-gray-400">Project</span>
            <span className="mx-2.5 h-3.5 w-px bg-gray-200" aria-hidden="true" />
            <div className="relative flex items-center">
              <select
                aria-label="Project filter"
                value={selectedProject}
                onChange={(e) => onProjectChange(e.target.value)}
                className="max-w-[180px] cursor-pointer appearance-none truncate bg-transparent pr-5 text-sm font-medium text-gray-900 focus:outline-none"
              >
                <option value="ALL">All Projects</option>
                {projects.map((proj) => (
                  <option key={proj} value={proj}>
                    {proj}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-0 h-3.5 w-3.5 text-gray-400" />
            </div>
          </div>

          {/* Token 口径切换胶囊开关 */}
          <div
            role="group"
            aria-label="Token counting mode"
            className="flex h-9 items-center rounded-full bg-[#ECEEF2] p-1 text-xs font-medium"
            title="切换 Token 统计口径：默认仅非缓存 (Input + Output)，或含缓存读取 (+ Cache Read)"
          >
            <button
              type="button"
              onClick={() => onTokenModeChange('non_cached')}
              className={`cursor-pointer rounded-full px-3 py-1 transition-all ${
                tokenMode === 'non_cached'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              Non-cached
            </button>
            <button
              type="button"
              onClick={() => onTokenModeChange('total')}
              className={`cursor-pointer rounded-full px-3 py-1 transition-all ${
                tokenMode === 'total'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              Include Cache
            </button>
          </div>

          {/* KPI 卡片显示视图切换 */}
          <div
            role="group"
            aria-label="KPI view mode"
            className="hidden h-9 items-center rounded-full bg-[#ECEEF2] p-1 text-xs font-medium sm:flex"
          >
            {KPI_VIEW_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onKpiViewChange(opt.value)}
                className={`cursor-pointer rounded-full px-2.5 py-1 transition-all ${
                  kpiView === opt.value
                    ? 'bg-white text-gray-900 shadow-xs'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 右侧操作区 */}
        <div className="flex items-center gap-2">
          {/* 30 秒静默自动刷新开关 + 手动刷新 */}
          <div className="flex h-9 items-center rounded-full border border-gray-200/80 bg-white pl-3 pr-1 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
            <button
              type="button"
              onClick={onAutoRefreshToggle}
              title={
                autoRefresh
                  ? `已开启每 30 秒静默刷新（上次更新 ${formatTimeOnly(lastUpdatedAt)}）`
                  : '自动刷新已暂停，点击开启'
              }
              className="flex cursor-pointer items-center gap-1.5 pr-2 text-xs font-medium text-gray-600 hover:text-gray-900"
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  autoRefresh ? 'bg-emerald-500' : 'bg-gray-300'
                }`}
              />
              <span className="hidden md:inline">
                {autoRefresh ? '30s Auto' : 'Paused'}
              </span>
            </button>
            <span className="h-3.5 w-px bg-gray-200" aria-hidden="true" />
            <button
              type="button"
              onClick={onManualRefresh}
              disabled={isRefreshing}
              aria-label="Refresh usage data"
              title={`立即刷新（上次更新 ${formatTimeOnly(lastUpdatedAt)}）`}
              className="ml-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`}
              />
            </button>
          </div>

          {/* 数据目录设置按钮 */}
          <button
            type="button"
            onClick={onOpenDataDir}
            title={
              dataRoot
                ? `当前数据目录：${dataRoot}（点击更改）`
                : '配置 Antigravity 本地数据目录'
            }
            aria-label="Configure Antigravity data directory"
            className="flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-gray-200/80 bg-white px-3 text-sm font-medium text-gray-700 shadow-[0_1px_2px_rgba(16,24,40,0.03)] transition-colors hover:border-gray-300 hover:text-gray-900"
          >
            <FolderCog className="h-3.5 w-3.5 text-gray-500" />
            <span className="hidden lg:inline">Data Dir</span>
          </button>

          {/* Pricing 设置按钮 */}
          <button
            type="button"
            onClick={onOpenPricing}
            className="flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-gray-200/80 bg-white px-3.5 text-sm font-medium text-gray-700 shadow-[0_1px_2px_rgba(16,24,40,0.03)] transition-colors hover:border-gray-300 hover:text-gray-900"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 text-gray-500" />
            <span>Pricing</span>
            <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">
              {currency}
            </span>
          </button>

          {/* 黑色圆角 Export 按钮 + 下拉菜单 */}
          <div className="relative" ref={exportRef}>
            <button
              type="button"
              onClick={() => setExportMenuOpen((prev) => !prev)}
              disabled={!hasData}
              className="flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-[#111827] px-4 text-sm font-medium text-white shadow-xs transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export</span>
            </button>

            {exportMenuOpen && (
              <div className="absolute right-0 z-30 mt-2 w-64 rounded-2xl border border-gray-100 bg-white p-1.5 shadow-[0_12px_32px_rgba(15,23,42,0.12)]">
                <button
                  type="button"
                  onClick={() => {
                    setExportMenuOpen(false);
                    onExportCsv();
                  }}
                  className="flex w-full cursor-pointer items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-gray-50"
                >
                  <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                  <div>
                    <div className="text-sm font-medium text-gray-900">Export CSV</div>
                    <div className="text-xs text-gray-500">
                      UTF-8 BOM 明细表，Excel 直接打开
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExportMenuOpen(false);
                    onExportJson();
                  }}
                  className="flex w-full cursor-pointer items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-gray-50"
                >
                  <FileJson className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
                  <div>
                    <div className="text-sm font-medium text-gray-900">Export JSON</div>
                    <div className="text-xs text-gray-500">
                      完整筛选元数据、会话汇总与事件明细
                    </div>
                  </div>
                </button>
                <div className="mt-1 border-t border-gray-100 px-3 py-2 text-[11px] text-gray-400">
                  口径：{tokenMode === 'total' ? '含缓存总 Token' : '非缓存 Token'} ·{' '}
                  {timeLabel}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 移动端 KPI 视图切换补充行 */}
      <div className="flex items-center justify-between sm:hidden">
        <div
          role="group"
          aria-label="KPI view mode mobile"
          className="flex h-8 items-center rounded-full bg-[#ECEEF2] p-0.5 text-xs font-medium"
        >
          {KPI_VIEW_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onKpiViewChange(opt.value)}
              className={`cursor-pointer rounded-full px-2.5 py-1 transition-all ${
                kpiView === opt.value
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-500'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
