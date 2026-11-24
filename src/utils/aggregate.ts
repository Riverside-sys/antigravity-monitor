import type {
  ModelPrice,
  PricingConfig,
  SessionSummary,
  TimeRangePreset,
  TokenMode,
  UsageApiResponse,
  UsageEvent,
} from '../types';
import {
  formatModelName,
  formatShortDate,
  toLocalDateKey,
  toLocalHourKey,
} from './format';

export const FALLBACK_MODEL_PRICE: ModelPrice = {
  inputPer1M: 1.25,
  cacheReadPer1M: 0.3125,
  outputPer1M: 10.0,
};

export const DEFAULT_PRICING_CONFIG: PricingConfig = {
  currency: 'CNY',
  usdToCnyRate: 7.2,
  models: {
    'gemini-4-hydrogen-high': { inputPer1M: 1.25, cacheReadPer1M: 0.3125, outputPer1M: 10.0 },
    'gemini-4-hydrogen-medium': { inputPer1M: 0.6, cacheReadPer1M: 0.15, outputPer1M: 4.0 },
    'gemini-4-hydrogen-tiered-high': { inputPer1M: 1.5, cacheReadPer1M: 0.375, outputPer1M: 12.0 },
    'gemini-4-neon-high': { inputPer1M: 0.3, cacheReadPer1M: 0.075, outputPer1M: 2.5 },
    'gemini-4-argon-high': { inputPer1M: 2.0, cacheReadPer1M: 0.5, outputPer1M: 12.0 },
  },
};

export interface FilterState {
  timeRange: TimeRangePreset;
  customStartDate: string; // YYYY-MM-DD
  customEndDate: string; // YYYY-MM-DD
  project: string; // 'ALL' 或具体 projectName
  tokenMode: TokenMode;
}

export interface KpiStats {
  totalCost: number;
  totalCacheSaved: number;
  cacheHitRate: number;
  activeSessions: number;
  coveredProjects: number;
  totalRequests: number;
  errorCount: number;
  displayTokens: number;
  nonCachedTokens: number;
  totalWithCacheTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  inputShare: number;
  outputShare: number;
  cacheShare: number;
}

export interface MetricValues {
  cost: number;
  tokens: number;
  requests: number;
}

export interface TrendBucket {
  key: string; // YYYY-MM-DD 或 HH:00
  label: string; // M/D 或 HH:00
  total: MetricValues;
  byModel: Record<string, MetricValues>;
  byProject: Record<string, MetricValues>;
}

export interface ModelBreakdownSeriesPoint {
  key: string;
  label: string;
  requests: number;
  tokens: number;
}

export interface ModelBreakdownItem {
  modelId: string;
  displayName: string;
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  errorCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  series: ModelBreakdownSeriesPoint[];
}

export interface SessionBreakdownRow {
  sessionId: string;
  title: string;
  projectName: string;
  agentName: string;
  primaryModel: string;
  primaryModelName: string;
  requests: number;
  errorCount: number;
  inputTokens: number;
  outputTokens: number;
  nonCachedTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  displayTokens: number;
  cacheHitRate: number;
  estimatedCost: number;
  cacheSaved: number;
  lastActiveAt: string;
}

export interface AggregatedDashboardData {
  filteredEvents: UsageEvent[];
  kpi: KpiStats;
  granularity: 'hour' | 'day';
  trendSeries: TrendBucket[];
  trendModelKeys: string[];
  trendProjectKeys: string[];
  modelBreakdowns: ModelBreakdownItem[];
  topSessions: SessionBreakdownRow[];
}

export function isErrorEvent(event: UsageEvent): boolean {
  return event.status === 'ERROR' || Boolean(event.error) || event.type === 'ERROR_MESSAGE';
}

export function isRequestEvent(event: UsageEvent): boolean {
  return event.type === 'PLANNER_RESPONSE' || event.type !== 'ERROR_MESSAGE';
}

export function getEventTokens(event: UsageEvent, tokenMode: TokenMode): number {
  const input = Math.max(0, Number(event.inputTokens) || 0);
  const output = Math.max(0, Number(event.outputTokens) || 0);
  const cacheRead = Math.max(0, Number(event.cacheReadTokens) || 0);
  return tokenMode === 'total' ? input + output + cacheRead : input + output;
}

export function calculateCacheHitRate(inputTokens: number, cacheReadTokens: number): number {
  const input = Math.max(0, inputTokens);
  const cache = Math.max(0, cacheReadTokens);
  const denominator = input + cache;
  return denominator > 0 ? cache / denominator : 0;
}

export function getModelPrice(modelId: string, pricing: PricingConfig): ModelPrice {
  if (modelId && pricing.models && pricing.models[modelId]) {
    return pricing.models[modelId];
  }
  return FALLBACK_MODEL_PRICE;
}

export function calculateEventCost(
  event: UsageEvent,
  pricing: PricingConfig,
): { cost: number; cacheSaved: number } {
  const input = Math.max(0, Number(event.inputTokens) || 0);
  const output = Math.max(0, Number(event.outputTokens) || 0);
  const cacheRead = Math.max(0, Number(event.cacheReadTokens) || 0);

  if (!event.model && input === 0 && output === 0 && cacheRead === 0) {
    return { cost: 0, cacheSaved: 0 };
  }

  const price = getModelPrice(event.model, pricing);
  const rate = pricing.currency === 'CNY' ? pricing.usdToCnyRate : 1;

  const costUsd =
    (input * price.inputPer1M +
      cacheRead * price.cacheReadPer1M +
      output * price.outputPer1M) /
    1_000_000;

  const savedUsd =
    (cacheRead * Math.max(0, price.inputPer1M - price.cacheReadPer1M)) / 1_000_000;

  return {
    cost: costUsd * rate,
    cacheSaved: savedUsd * rate,
  };
}

function parseLocalDateStart(dateStr: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((dateStr ?? '').trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const d = new Date(year, month, day, 0, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseLocalDateEnd(dateStr: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((dateStr ?? '').trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const d = new Date(year, month, day, 23, 59, 59, 999);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function resolveTimeRangeBounds(
  timeRange: TimeRangePreset,
  customStartDate: string,
  customEndDate: string,
  now: Date = new Date(),
): { startMs: number | null; endMs: number | null } {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  switch (timeRange) {
    case 'today': {
      const start = new Date(y, m, d, 0, 0, 0, 0);
      return { startMs: start.getTime(), endMs: now.getTime() };
    }
    case '7d': {
      const start = new Date(y, m, d - 6, 0, 0, 0, 0);
      const end = new Date(y, m, d, 23, 59, 59, 999);
      return { startMs: start.getTime(), endMs: end.getTime() };
    }
    case '30d': {
      const start = new Date(y, m, d - 29, 0, 0, 0, 0);
      const end = new Date(y, m, d, 23, 59, 59, 999);
      return { startMs: start.getTime(), endMs: end.getTime() };
    }
    case 'custom': {
      const s = parseLocalDateStart(customStartDate);
      const e = parseLocalDateEnd(customEndDate);
      if (s && e && s.getTime() > e.getTime()) {
        // 起止日期反序时自动交换
        const swappedStart = parseLocalDateStart(customEndDate);
        const swappedEnd = parseLocalDateEnd(customStartDate);
        return {
          startMs: swappedStart ? swappedStart.getTime() : null,
          endMs: swappedEnd ? swappedEnd.getTime() : null,
        };
      }
      return {
        startMs: s ? s.getTime() : null,
        endMs: e ? e.getTime() : null,
      };
    }
    case 'all':
    default:
      return { startMs: null, endMs: null };
  }
}

export function getSessionProjectName(
  sessionId: string,
  sessions: Record<string, SessionSummary>,
): string {
  const session = sessions[sessionId];
  const project = session?.projectName?.trim();
  return project || 'Outside of Project';
}

export function filterUsageEvents(
  usage: UsageApiResponse,
  filters: FilterState,
  now: Date = new Date(),
): UsageEvent[] {
  const { startMs, endMs } = resolveTimeRangeBounds(
    filters.timeRange,
    filters.customStartDate,
    filters.customEndDate,
    now,
  );

  return usage.events.filter((event) => {
    const ts = Date.parse(event.createdAt);
    if (Number.isNaN(ts)) {
      return false;
    }
    if (startMs !== null && ts < startMs) {
      return false;
    }
    if (endMs !== null && ts > endMs) {
      return false;
    }
    if (filters.project && filters.project !== 'ALL') {
      const projectName = getSessionProjectName(event.sessionId, usage.sessions);
      if (projectName !== filters.project) {
        return false;
      }
    }
    return true;
  });
}

function buildBucketKeys(
  filters: FilterState,
  filteredEvents: UsageEvent[],
  now: Date,
): { granularity: 'hour' | 'day'; keys: string[] } {
  const isSingleCustomDay =
    filters.timeRange === 'custom' &&
    Boolean(filters.customStartDate) &&
    filters.customStartDate === filters.customEndDate;

  if (filters.timeRange === 'today' || isSingleCustomDay) {
    const keys: string[] = [];
    for (let h = 0; h < 24; h += 1) {
      keys.push(`${String(h).padStart(2, '0')}:00`);
    }
    return { granularity: 'hour', keys };
  }

  const { startMs, endMs } = resolveTimeRangeBounds(
    filters.timeRange,
    filters.customStartDate,
    filters.customEndDate,
    now,
  );

  let rangeStart: Date;
  let rangeEnd: Date;

  if (startMs !== null && endMs !== null) {
    rangeStart = new Date(startMs);
    rangeEnd = new Date(endMs);
  } else if (filteredEvents.length > 0) {
    const timestamps = filteredEvents
      .map((e) => Date.parse(e.createdAt))
      .filter((t) => !Number.isNaN(t));
    const minTs = Math.min(...timestamps);
    const maxTs = Math.max(...timestamps, now.getTime());
    rangeStart = startMs !== null ? new Date(startMs) : new Date(minTs);
    rangeEnd = endMs !== null ? new Date(endMs) : new Date(maxTs);
  } else {
    rangeEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  }

  const cursor = new Date(
    rangeStart.getFullYear(),
    rangeStart.getMonth(),
    rangeStart.getDate(),
    0,
    0,
    0,
    0,
  );
  const endDate = new Date(
    rangeEnd.getFullYear(),
    rangeEnd.getMonth(),
    rangeEnd.getDate(),
    0,
    0,
    0,
    0,
  );

  const keys: string[] = [];
  // 防止极端异常起止日期导致死循环，最多生成 3650 天（10 年）
  let guard = 0;
  while (cursor.getTime() <= endDate.getTime() && guard < 3650) {
    keys.push(toLocalDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }

  if (keys.length === 0) {
    keys.push(toLocalDateKey(now));
  }

  return { granularity: 'day', keys };
}

function addMetricValues(target: MetricValues, cost: number, tokens: number, requests: number) {
  target.cost += cost;
  target.tokens += tokens;
  target.requests += requests;
}

export function aggregateUsageData(
  usage: UsageApiResponse,
  pricing: PricingConfig,
  filters: FilterState,
  now: Date = new Date(),
): AggregatedDashboardData {
  const filteredEvents = filterUsageEvents(usage, filters, now);
  const { granularity, keys } = buildBucketKeys(filters, filteredEvents, now);

  // 初始化连续趋势桶
  const bucketMap = new Map<string, TrendBucket>();
  for (const key of keys) {
    bucketMap.set(key, {
      key,
      label: granularity === 'hour' ? key : formatShortDate(key),
      total: { cost: 0, tokens: 0, requests: 0 },
      byModel: {},
      byProject: {},
    });
  }

  // KPI 累计器
  let totalCost = 0;
  let totalCacheSaved = 0;
  let totalRequests = 0;
  let errorCount = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  const activeSessionIds = new Set<string>();
  const activeProjectSet = new Set<string>();

  const modelTotalTokensRank = new Map<string, number>();
  const projectTotalTokensRank = new Map<string, number>();

  // 按模型拆分的统计结构
  interface ModelAcc {
    totalRequests: number;
    totalTokens: number;
    totalCost: number;
    errorCount: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    bucketSeries: Map<string, { requests: number; tokens: number }>;
  }
  const modelAccMap = new Map<string, ModelAcc>();

  // 按会话拆分的统计结构
  interface SessionAcc {
    sessionId: string;
    requests: number;
    errorCount: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    estimatedCost: number;
    cacheSaved: number;
    lastActiveAt: string;
    lastActiveMs: number;
    modelStats: Map<string, { requests: number; tokens: number }>;
  }
  const sessionAccMap = new Map<string, SessionAcc>();

  for (const event of filteredEvents) {
    const projectName = getSessionProjectName(event.sessionId, usage.sessions);
    const reqFlag = isRequestEvent(event);
    const errFlag = isErrorEvent(event);
    const reqInc = reqFlag ? 1 : 0;
    const errInc = errFlag ? 1 : 0;

    const evInput = Math.max(0, Number(event.inputTokens) || 0);
    const evOutput = Math.max(0, Number(event.outputTokens) || 0);
    const evCache = Math.max(0, Number(event.cacheReadTokens) || 0);
    const evDisplayTokens = getEventTokens(event, filters.tokenMode);
    const { cost: evCost, cacheSaved: evSaved } = calculateEventCost(event, pricing);

    totalCost += evCost;
    totalCacheSaved += evSaved;
    totalRequests += reqInc;
    errorCount += errInc;
    inputTokens += evInput;
    outputTokens += evOutput;
    cacheReadTokens += evCache;

    activeSessionIds.add(event.sessionId);
    activeProjectSet.add(projectName);

    // 桶映射
    const evDate = new Date(event.createdAt);
    const bucketKey =
      granularity === 'hour' ? toLocalHourKey(evDate) : toLocalDateKey(evDate);
    const bucket = bucketMap.get(bucketKey);

    if (bucket) {
      addMetricValues(bucket.total, evCost, evDisplayTokens, reqInc);

      if (!bucket.byProject[projectName]) {
        bucket.byProject[projectName] = { cost: 0, tokens: 0, requests: 0 };
      }
      addMetricValues(bucket.byProject[projectName], evCost, evDisplayTokens, reqInc);
      projectTotalTokensRank.set(
        projectName,
        (projectTotalTokensRank.get(projectName) ?? 0) + evDisplayTokens + reqInc * 0.001,
      );

      if (event.model) {
        if (!bucket.byModel[event.model]) {
          bucket.byModel[event.model] = { cost: 0, tokens: 0, requests: 0 };
        }
        addMetricValues(bucket.byModel[event.model], evCost, evDisplayTokens, reqInc);
        modelTotalTokensRank.set(
          event.model,
          (modelTotalTokensRank.get(event.model) ?? 0) + evDisplayTokens + reqInc * 0.001,
        );
      }
    }

    // 按模型明细累计（仅计入有明确 model 的事件）
    if (event.model) {
      let mAcc = modelAccMap.get(event.model);
      if (!mAcc) {
        mAcc = {
          totalRequests: 0,
          totalTokens: 0,
          totalCost: 0,
          errorCount: 0,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          bucketSeries: new Map(),
        };
        modelAccMap.set(event.model, mAcc);
      }
      mAcc.totalRequests += reqInc;
      mAcc.totalTokens += evDisplayTokens;
      mAcc.totalCost += evCost;
      mAcc.errorCount += errInc;
      mAcc.inputTokens += evInput;
      mAcc.outputTokens += evOutput;
      mAcc.cacheReadTokens += evCache;

      const curPoint = mAcc.bucketSeries.get(bucketKey) ?? { requests: 0, tokens: 0 };
      curPoint.requests += reqInc;
      curPoint.tokens += evDisplayTokens;
      mAcc.bucketSeries.set(bucketKey, curPoint);
    }

    // 按会话明细累计
    let sAcc = sessionAccMap.get(event.sessionId);
    const evMs = evDate.getTime();
    if (!sAcc) {
      sAcc = {
        sessionId: event.sessionId,
        requests: 0,
        errorCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        estimatedCost: 0,
        cacheSaved: 0,
        lastActiveAt: event.createdAt,
        lastActiveMs: Number.isNaN(evMs) ? 0 : evMs,
        modelStats: new Map(),
      };
      sessionAccMap.set(event.sessionId, sAcc);
    }
    sAcc.requests += reqInc;
    sAcc.errorCount += errInc;
    sAcc.inputTokens += evInput;
    sAcc.outputTokens += evOutput;
    sAcc.cacheReadTokens += evCache;
    sAcc.estimatedCost += evCost;
    sAcc.cacheSaved += evSaved;

    if (!Number.isNaN(evMs) && evMs >= sAcc.lastActiveMs) {
      sAcc.lastActiveMs = evMs;
      sAcc.lastActiveAt = event.createdAt;
    }

    if (event.model) {
      const prevM = sAcc.modelStats.get(event.model) ?? { requests: 0, tokens: 0 };
      prevM.requests += reqInc;
      prevM.tokens += evDisplayTokens;
      sAcc.modelStats.set(event.model, prevM);
    }
  }

  const nonCachedTokens = inputTokens + outputTokens;
  const totalWithCacheTokens = nonCachedTokens + cacheReadTokens;
  const displayTokens =
    filters.tokenMode === 'total' ? totalWithCacheTokens : nonCachedTokens;
  const cacheHitRate = calculateCacheHitRate(inputTokens, cacheReadTokens);

  const kpi: KpiStats = {
    totalCost,
    totalCacheSaved,
    cacheHitRate,
    activeSessions: activeSessionIds.size,
    coveredProjects: activeProjectSet.size,
    totalRequests,
    errorCount,
    displayTokens,
    nonCachedTokens,
    totalWithCacheTokens,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    inputShare: totalWithCacheTokens > 0 ? inputTokens / totalWithCacheTokens : 0,
    outputShare: totalWithCacheTokens > 0 ? outputTokens / totalWithCacheTokens : 0,
    cacheShare: totalWithCacheTokens > 0 ? cacheReadTokens / totalWithCacheTokens : 0,
  };

  const trendSeries = keys.map((k) => bucketMap.get(k)!);

  const trendModelKeys = Array.from(modelTotalTokensRank.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([modelId]) => modelId);

  const trendProjectKeys = Array.from(projectTotalTokensRank.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([project]) => project);

  const modelBreakdowns: ModelBreakdownItem[] = Array.from(modelAccMap.entries())
    .map(([modelId, acc]) => ({
      modelId,
      displayName: formatModelName(modelId),
      totalRequests: acc.totalRequests,
      totalTokens: acc.totalTokens,
      totalCost: acc.totalCost,
      errorCount: acc.errorCount,
      inputTokens: acc.inputTokens,
      outputTokens: acc.outputTokens,
      cacheReadTokens: acc.cacheReadTokens,
      series: keys.map((key) => {
        const point = acc.bucketSeries.get(key);
        return {
          key,
          label: granularity === 'hour' ? key : formatShortDate(key),
          requests: point?.requests ?? 0,
          tokens: point?.tokens ?? 0,
        };
      }),
    }))
    .sort((a, b) => b.totalTokens - a.totalTokens || b.totalRequests - a.totalRequests);

  const topSessions: SessionBreakdownRow[] = Array.from(sessionAccMap.values())
    .map((sAcc) => {
      const meta = usage.sessions[sAcc.sessionId];
      const title = meta?.title?.trim() || `Session ${sAcc.sessionId.slice(0, 8)}`;
      const projectName = getSessionProjectName(sAcc.sessionId, usage.sessions);
      const agentName = meta?.agentName ?? '';

      let primaryModel = '';
      let maxReq = -1;
      let maxTok = -1;
      for (const [mId, stats] of sAcc.modelStats.entries()) {
        if (stats.requests > maxReq || (stats.requests === maxReq && stats.tokens > maxTok)) {
          maxReq = stats.requests;
          maxTok = stats.tokens;
          primaryModel = mId;
        }
      }

      const sNonCached = sAcc.inputTokens + sAcc.outputTokens;
      const sTotal = sNonCached + sAcc.cacheReadTokens;
      const sDisplay = filters.tokenMode === 'total' ? sTotal : sNonCached;

      return {
        sessionId: sAcc.sessionId,
        title,
        projectName,
        agentName,
        primaryModel,
        primaryModelName: primaryModel ? formatModelName(primaryModel) : '—',
        requests: sAcc.requests,
        errorCount: sAcc.errorCount,
        inputTokens: sAcc.inputTokens,
        outputTokens: sAcc.outputTokens,
        nonCachedTokens: sNonCached,
        cacheReadTokens: sAcc.cacheReadTokens,
        totalTokens: sTotal,
        displayTokens: sDisplay,
        cacheHitRate: calculateCacheHitRate(sAcc.inputTokens, sAcc.cacheReadTokens),
        estimatedCost: sAcc.estimatedCost,
        cacheSaved: sAcc.cacheSaved,
        lastActiveAt: sAcc.lastActiveAt || meta?.lastActiveAt || '',
      };
    })
    .sort((a, b) => b.displayTokens - a.displayTokens || b.requests - a.requests);

  return {
    filteredEvents,
    kpi,
    granularity,
    trendSeries,
    trendModelKeys,
    trendProjectKeys,
    modelBreakdowns,
    topSessions,
  };
}
