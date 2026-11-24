import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, FolderCog, Inbox, RotateCcw } from 'lucide-react';
import { DataDirModal } from './components/DataDirModal';
import { KpiCards } from './components/KpiCards';
import { MainTrendChart } from './components/MainTrendChart';
import { ModelBreakdown } from './components/ModelBreakdown';
import { PricingModal } from './components/PricingModal';
import { TopBar } from './components/TopBar';
import { TopSessionsTable } from './components/TopSessionsTable';
import type {
  DataSourceConfig,
  KpiViewMode,
  PricingConfig,
  TimeRangePreset,
  TokenMode,
  TrendGroupBy,
  TrendMetric,
  UsageApiResponse,
} from './types';
import {
  DEFAULT_PRICING_CONFIG,
  type FilterState,
  aggregateUsageData,
} from './utils/aggregate';
import {
  buildExportFilename,
  downloadExportFile,
  generateCsvExport,
  generateJsonExport,
} from './utils/exportData';
import { toLocalDateKey } from './utils/format';

const AUTO_REFRESH_INTERVAL_MS = 30_000;

function getDefaultCustomDates(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 6,
  );
  return {
    start: toLocalDateKey(start),
    end: toLocalDateKey(now),
  };
}

export default function App() {
  const defaultCustom = useMemo(() => getDefaultCustomDates(), []);

  // 数据状态
  const [usage, setUsage] = useState<UsageApiResponse | null>(null);
  const [pricing, setPricing] = useState<PricingConfig>(DEFAULT_PRICING_CONFIG);
  const [dataConfig, setDataConfig] = useState<DataSourceConfig | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string>('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // 筛选与视图状态（默认 Last 7 days / All Projects / Non-cached）
  const [timeRange, setTimeRange] = useState<TimeRangePreset>('7d');
  const [customStartDate, setCustomStartDate] = useState(defaultCustom.start);
  const [customEndDate, setCustomEndDate] = useState(defaultCustom.end);
  const [selectedProject, setSelectedProject] = useState<string>('ALL');
  const [tokenMode, setTokenMode] = useState<TokenMode>('non_cached');
  const [kpiView, setKpiView] = useState<KpiViewMode>('all');
  const [trendMetric, setTrendMetric] = useState<TrendMetric>('cost');
  const [trendGroupBy, setTrendGroupBy] = useState<TrendGroupBy>('model');

  // 自动刷新与弹窗
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [pricingModalOpen, setPricingModalOpen] = useState(false);
  const [dataDirModalOpen, setDataDirModalOpen] = useState(false);

  const isFetchingRef = useRef(false);

  const showToast = useCallback((message: string) => {
    setToastMsg(message);
  }, []);

  useEffect(() => {
    if (!toastMsg) return;
    const timer = window.setTimeout(() => setToastMsg(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toastMsg]);

  const fetchDashboardData = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;

      if (!options.silent) {
        setIsRefreshing(true);
      }

      try {
        const [usageRes, pricingRes, configRes] = await Promise.all([
          fetch('/api/usage'),
          fetch('/api/pricing'),
          fetch('/api/config'),
        ]);

        if (!usageRes.ok) {
          throw new Error(`加载用量数据失败 (HTTP ${usageRes.status})`);
        }
        const usageJson = (await usageRes.json()) as UsageApiResponse;

        if (pricingRes.ok) {
          const pricingJson = (await pricingRes.json()) as PricingConfig;
          setPricing(pricingJson);
        }

        if (configRes.ok) {
          const configJson = (await configRes.json()) as DataSourceConfig;
          setDataConfig(configJson);
        }

        setUsage(usageJson);
        setLastUpdatedAt(new Date().toISOString());
        setErrorMsg(null);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : '加载本地监控数据失败';
        // 仅在尚未有数据时展示阻塞错误，静默刷新不打断已有画面
        if (!options.silent) {
          setErrorMsg(message);
        }
      } finally {
        isFetchingRef.current = false;
        setInitialLoading(false);
        setIsRefreshing(false);
      }
    },
    [],
  );

  // 首次挂载拉取
  useEffect(() => {
    void fetchDashboardData();
  }, [fetchDashboardData]);

  // 每 30 秒静默自动刷新
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => {
      void fetchDashboardData({ silent: true });
    }, AUTO_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [autoRefresh, fetchDashboardData]);

  const filters: FilterState = useMemo(
    () => ({
      timeRange,
      customStartDate,
      customEndDate,
      project: selectedProject,
      tokenMode,
    }),
    [timeRange, customStartDate, customEndDate, selectedProject, tokenMode],
  );

  const aggregated = useMemo(() => {
    if (!usage) return null;
    return aggregateUsageData(usage, pricing, filters, new Date());
  }, [usage, pricing, filters]);

  const handleSavePricing = useCallback(
    async (nextPricing: PricingConfig) => {
      const res = await fetch('/api/pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextPricing),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof body?.error === 'string'
            ? body.error
            : `保存失败 (HTTP ${res.status})`,
        );
      }

      setPricing(body as PricingConfig);
      showToast('单价与汇率配置已保存');
    },
    [showToast],
  );

  const handleSaveDataDir = useCallback(
    async (customDataRoot: string) => {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customDataRoot }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof body?.error === 'string'
            ? body.error
            : `保存失败 (HTTP ${res.status})`,
        );
      }

      setDataConfig(body as DataSourceConfig);
      await fetchDashboardData();
      showToast(
        customDataRoot.trim()
          ? '数据目录已更新并完成重新扫描'
          : '已恢复默认数据目录',
      );
    },
    [fetchDashboardData, showToast],
  );

  const handleExportCsv = useCallback(() => {
    if (!usage || !aggregated) return;
    const csv = generateCsvExport(aggregated, usage, pricing, filters);
    const filename = buildExportFilename(filters, 'csv');
    downloadExportFile(filename, csv, 'text/csv;charset=utf-8;');
    showToast(`已导出 ${filename}`);
  }, [usage, aggregated, pricing, filters, showToast]);

  const handleExportJson = useCallback(() => {
    if (!usage || !aggregated) return;
    const json = generateJsonExport(aggregated, usage, pricing, filters);
    const filename = buildExportFilename(filters, 'json');
    downloadExportFile(filename, json, 'application/json;charset=utf-8;');
    showToast(`已导出 ${filename}`);
  }, [usage, aggregated, pricing, filters, showToast]);

  const handleResetFilters = useCallback(() => {
    setTimeRange('all');
    setSelectedProject('ALL');
  }, []);

  return (
    <div className="min-h-screen bg-[#F7F8FA] text-[#111827]">
      <div className="mx-auto max-w-[1280px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        {/* 顶部筛选与控制栏 */}
        <TopBar
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
          customStartDate={customStartDate}
          onCustomStartDateChange={setCustomStartDate}
          customEndDate={customEndDate}
          onCustomEndDateChange={setCustomEndDate}
          projects={usage?.projects ?? []}
          selectedProject={selectedProject}
          onProjectChange={setSelectedProject}
          tokenMode={tokenMode}
          onTokenModeChange={setTokenMode}
          kpiView={kpiView}
          onKpiViewChange={setKpiView}
          autoRefresh={autoRefresh}
          onAutoRefreshToggle={() => setAutoRefresh((prev) => !prev)}
          onManualRefresh={() => void fetchDashboardData()}
          isRefreshing={isRefreshing}
          lastUpdatedAt={lastUpdatedAt}
          currency={pricing.currency}
          dataRoot={
            dataConfig?.effectiveDataRoot ?? usage?.coverage.dataRoot
          }
          onOpenDataDir={() => setDataDirModalOpen(true)}
          onOpenPricing={() => setPricingModalOpen(true)}
          onExportCsv={handleExportCsv}
          onExportJson={handleExportJson}
          hasData={Boolean(aggregated && aggregated.filteredEvents.length > 0)}
        />

        {/* 错误提示（若无缓存数据则居中展示，若有数据则顶部温和条幅提示） */}
        {errorMsg && !usage && !initialLoading && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-rose-200/80 bg-white px-6 py-16 text-center shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
            <AlertCircle className="h-10 w-10 text-rose-500" />
            <h2 className="mt-3 text-base font-semibold text-gray-900">
              无法读取本地 Antigravity 用量数据
            </h2>
            <p className="mt-1 max-w-md text-sm text-gray-500">{errorMsg}</p>
            <button
              type="button"
              onClick={() => void fetchDashboardData()}
              className="mt-5 inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-[#111827] px-5 py-2 text-xs font-medium text-white hover:bg-black"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>重试加载</span>
            </button>
          </div>
        )}

        {errorMsg && usage && (
          <div className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-2.5 text-xs text-amber-800">
            <span>刷新数据时遇到问题：{errorMsg}（当前展示最近一次成功缓存）</span>
            <button
              type="button"
              onClick={() => void fetchDashboardData()}
              className="cursor-pointer font-medium underline hover:text-amber-950"
            >
              重试
            </button>
          </div>
        )}

        {/* 首次加载骨架屏 */}
        {initialLoading && (
          <div className="space-y-5 animate-pulse">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-[132px] rounded-2xl border border-gray-200/70 bg-white p-6"
                >
                  <div className="h-3.5 w-24 rounded bg-gray-100" />
                  <div className="mt-4 h-8 w-36 rounded bg-gray-100" />
                  <div className="mt-4 h-3 w-28 rounded bg-gray-100" />
                </div>
              ))}
            </div>
            <div className="h-[340px] rounded-2xl border border-gray-200/70 bg-white p-6" />
          </div>
        )}

        {/* 正常数据内容 */}
        {!initialLoading && usage && aggregated && (
          <>
            <KpiCards
              kpi={aggregated.kpi}
              currency={pricing.currency}
              tokenMode={tokenMode}
              kpiView={kpiView}
            />

            {aggregated.filteredEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200/70 bg-white px-6 py-16 text-center shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
                <Inbox className="h-10 w-10 text-gray-300" />
                <h2 className="mt-3 text-sm font-semibold text-gray-800">
                  {usage.events.length === 0
                    ? '未在当前数据目录检测到 Antigravity 会话日志'
                    : '当前筛选范围内暂无模型用量记录'}
                </h2>
                <p className="mt-1 max-w-lg break-all text-xs text-gray-400">
                  {usage.events.length === 0
                    ? `当前扫描目录：${dataConfig?.effectiveDataRoot ?? usage.coverage.dataRoot ?? '~/.gemini/antigravity'}。如果你的 Antigravity 数据存放在其他位置，可点击下方按钮手动指定。`
                    : '可以尝试扩大时间范围（如 All time）或切换为 All Projects'}
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
                  {usage.events.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => setDataDirModalOpen(true)}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-[#111827] px-4 py-1.5 text-xs font-medium text-white hover:bg-black"
                    >
                      <FolderCog className="h-3.5 w-3.5" />
                      <span>指定 Antigravity 数据目录</span>
                    </button>
                  ) : (
                    (timeRange !== 'all' || selectedProject !== 'ALL') && (
                      <button
                        type="button"
                        onClick={handleResetFilters}
                        className="cursor-pointer rounded-full border border-gray-200 bg-white px-4 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        查看全部记录
                      </button>
                    )
                  )}
                </div>
              </div>
            ) : (
              <>
                <MainTrendChart
                  trendSeries={aggregated.trendSeries}
                  modelKeys={aggregated.trendModelKeys}
                  projectKeys={aggregated.trendProjectKeys}
                  kpi={aggregated.kpi}
                  currency={pricing.currency}
                  tokenMode={tokenMode}
                  metric={trendMetric}
                  onMetricChange={setTrendMetric}
                  groupBy={trendGroupBy}
                  onGroupByChange={setTrendGroupBy}
                />

                <ModelBreakdown
                  models={aggregated.modelBreakdowns}
                  currency={pricing.currency}
                  tokenMode={tokenMode}
                />

                <TopSessionsTable
                  sessions={aggregated.topSessions}
                  currency={pricing.currency}
                  tokenMode={tokenMode}
                />
              </>
            )}

            {/* 页脚：透明数据覆盖说明 */}
            <footer className="pt-2 pb-4 text-center text-xs text-gray-400">
              已扫描 {usage.coverage.scannedSessions} 个新版会话；
              {usage.coverage.legacyPbSessions} 个早期旧格式 (.pb) 会话未计入
              {usage.coverage.sqliteSupported === false
                ? ' · 当前 Node 版本不支持内置 SQLite（升级至 Node 22.5+ 可关联项目名称与会话标题）'
                : !usage.coverage.dbAvailable
                  ? ' · conversation_summaries.db 不可用，已按降级元数据展示'
                  : ''}
            </footer>
          </>
        )}
      </div>

      {/* 数据目录配置弹窗 */}
      <DataDirModal
        isOpen={dataDirModalOpen}
        onClose={() => setDataDirModalOpen(false)}
        config={dataConfig}
        onSave={handleSaveDataDir}
      />

      {/* Pricing 配置弹窗 */}
      <PricingModal
        isOpen={pricingModalOpen}
        onClose={() => setPricingModalOpen(false)}
        pricing={pricing}
        discoveredModels={usage?.models ?? []}
        onSave={handleSavePricing}
      />

      {/* 轻量操作提示 */}
      {toastMsg && (
        <div
          role="status"
          className="fixed bottom-5 right-5 z-50 rounded-full bg-[#111827] px-4 py-2 text-xs font-medium text-white shadow-lg"
        >
          {toastMsg}
        </div>
      )}
    </div>
  );
}
