import type { PricingConfig, UsageApiResponse } from '../types';
import {
  type AggregatedDashboardData,
  type FilterState,
  calculateCacheHitRate,
  calculateEventCost,
  getEventTokens,
  getSessionProjectName,
} from './aggregate';
import { formatModelName, toLocalDateKey } from './format';

export function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function generateCsvExport(
  aggregated: AggregatedDashboardData,
  usage: UsageApiResponse,
  pricing: PricingConfig,
  filters: FilterState,
): string {
  const headers = [
    'created_at',
    'session_id',
    'session_title',
    'project_name',
    'type',
    'status',
    'model_id',
    'model_name',
    'token_mode',
    'display_tokens',
    'input_tokens',
    'output_tokens',
    'cache_read_tokens',
    'cache_hit_rate',
    'estimated_cost',
    'cache_saved',
    'currency',
    'error',
  ];

  const rows: string[] = [headers.map(escapeCsvCell).join(',')];

  for (const event of aggregated.filteredEvents) {
    const session = usage.sessions[event.sessionId];
    const sessionTitle = session?.title?.trim() || `Session ${event.sessionId.slice(0, 8)}`;
    const projectName = getSessionProjectName(event.sessionId, usage.sessions);
    const modelName = event.model ? formatModelName(event.model) : '';
    const displayTokens = getEventTokens(event, filters.tokenMode);
    const cacheHitRate = calculateCacheHitRate(event.inputTokens, event.cacheReadTokens);
    const { cost, cacheSaved } = calculateEventCost(event, pricing);

    const cells = [
      event.createdAt,
      event.sessionId,
      sessionTitle,
      projectName,
      event.type,
      event.status,
      event.model,
      modelName,
      filters.tokenMode,
      displayTokens,
      event.inputTokens,
      event.outputTokens,
      event.cacheReadTokens,
      Number(cacheHitRate.toFixed(6)),
      Number(cost.toFixed(6)),
      Number(cacheSaved.toFixed(6)),
      pricing.currency,
      event.error ?? '',
    ];

    rows.push(cells.map(escapeCsvCell).join(','));
  }

  // 添加 UTF-8 BOM 以防 Excel 打开中文乱码
  return `\uFEFF${rows.join('\r\n')}`;
}

export function generateJsonExport(
  aggregated: AggregatedDashboardData,
  usage: UsageApiResponse,
  pricing: PricingConfig,
  filters: FilterState,
  exportedAt: string = new Date().toISOString(),
): string {
  const events = aggregated.filteredEvents.map((event) => {
    const session = usage.sessions[event.sessionId];
    const sessionTitle = session?.title?.trim() || `Session ${event.sessionId.slice(0, 8)}`;
    const projectName = getSessionProjectName(event.sessionId, usage.sessions);
    const { cost, cacheSaved } = calculateEventCost(event, pricing);

    return {
      ...event,
      sessionTitle,
      projectName,
      modelDisplayName: event.model ? formatModelName(event.model) : '',
      tokenMode: filters.tokenMode,
      displayTokens: getEventTokens(event, filters.tokenMode),
      cacheHitRate: calculateCacheHitRate(event.inputTokens, event.cacheReadTokens),
      estimatedCost: cost,
      cacheSaved,
      currency: pricing.currency,
    };
  });

  const payload = {
    exportedAt,
    filters: {
      timeRange: filters.timeRange,
      customStartDate: filters.timeRange === 'custom' ? filters.customStartDate : undefined,
      customEndDate: filters.timeRange === 'custom' ? filters.customEndDate : undefined,
      project: filters.project,
      tokenMode: filters.tokenMode,
    },
    pricing: {
      currency: pricing.currency,
      usdToCnyRate: pricing.usdToCnyRate,
    },
    summary: aggregated.kpi,
    sessions: aggregated.topSessions,
    events,
  };

  return JSON.stringify(payload, null, 2);
}

export function buildExportFilename(
  filters: FilterState,
  extension: 'csv' | 'json',
  now: Date = new Date(),
): string {
  const datePart = toLocalDateKey(now);
  const projectSlug =
    filters.project === 'ALL'
      ? 'all-projects'
      : filters.project.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]+/g, '-');
  return `antigravity-usage-${filters.timeRange}-${projectSlug}-${filters.tokenMode}-${datePart}.${extension}`;
}

export function downloadExportFile(
  filename: string,
  content: string,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
