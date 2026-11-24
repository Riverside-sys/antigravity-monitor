import { describe, expect, it } from 'vitest';
import type { PricingConfig, UsageApiResponse } from '../../types';
import {
  FALLBACK_MODEL_PRICE,
  aggregateUsageData,
  calculateCacheHitRate,
  calculateEventCost,
} from '../aggregate';
import { generateCsvExport, generateJsonExport } from '../exportData';
import { formatCompactNumber, formatCurrency, formatModelName } from '../format';

function createSampleUsage(): UsageApiResponse {
  return {
    events: [
      {
        id: 's1:1',
        sessionId: 's1',
        stepIndex: 1,
        type: 'PLANNER_RESPONSE',
        model: 'gemini-4-hydrogen-high',
        inputTokens: 100_000,
        outputTokens: 10_000,
        cacheReadTokens: 300_000,
        createdAt: '2026-11-24T02:15:00.000Z', // 10:15 UTC+8
        status: 'DONE',
        toolCallsCount: 2,
      },
      {
        id: 's1:2',
        sessionId: 's1',
        stepIndex: 2,
        type: 'ERROR_MESSAGE',
        model: '',
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        createdAt: '2026-11-24T03:00:00.000Z', // 11:00 UTC+8
        status: 'DONE',
        error: 'API timeout, "retry" failed\nline2',
        toolCallsCount: 0,
      },
      {
        id: 's2:1',
        sessionId: 's2',
        stepIndex: 1,
        type: 'PLANNER_RESPONSE',
        model: 'custom-unknown-model',
        inputTokens: 200_000,
        outputTokens: 50_000,
        cacheReadTokens: 0,
        createdAt: '2026-11-20T08:00:00.000Z', // 4 days ago
        status: 'ERROR',
        error: 'Rate limit',
        toolCallsCount: 0,
      },
      {
        id: 's3:1',
        sessionId: 's3',
        stepIndex: 1,
        type: 'PLANNER_RESPONSE',
        model: 'gemini-4-neon-high',
        inputTokens: 500_000,
        outputTokens: 20_000,
        cacheReadTokens: 500_000,
        createdAt: '2026-11-10T05:00:00.000Z', // 14 days ago (outside 7d)
        status: 'DONE',
        toolCallsCount: 1,
      },
    ],
    sessions: {
      s1: {
        sessionId: 's1',
        title: 'Monitor, "UI" Build',
        workspaceUris: ['file:///d:/a_study/AI/antigravity-moniter'],
        projectName: 'antigravity-moniter',
        lastActiveAt: '2026-11-24T03:00:00.000Z',
        firstActiveAt: '2026-11-24T02:15:00.000Z',
        hasTranscript: true,
      },
      s2: {
        sessionId: 's2',
        title: 'Quick Chat',
        workspaceUris: [],
        projectName: 'Outside of Project',
        lastActiveAt: '2026-11-20T08:00:00.000Z',
        firstActiveAt: '2026-11-20T08:00:00.000Z',
        hasTranscript: true,
      },
      s3: {
        sessionId: 's3',
        title: 'Old Session',
        workspaceUris: ['file:///d:/other'],
        projectName: 'other-project',
        lastActiveAt: '2026-11-10T05:00:00.000Z',
        firstActiveAt: '2026-11-10T05:00:00.000Z',
        hasTranscript: true,
      },
    },
    projects: ['antigravity-moniter', 'other-project', 'Outside of Project'],
    models: ['custom-unknown-model', 'gemini-4-hydrogen-high', 'gemini-4-neon-high'],
    coverage: {
      scannedSessions: 3,
      legacyPbSessions: 21,
      totalPbFiles: 21,
      dbAvailable: true,
      lastScannedAt: '2026-11-24T04:00:00.000Z',
    },
  };
}

const samplePricing: PricingConfig = {
  currency: 'CNY',
  usdToCnyRate: 7.2,
  models: {
    'gemini-4-hydrogen-high': {
      inputPer1M: 1.25,
      cacheReadPer1M: 0.3125,
      outputPer1M: 10.0,
    },
    'gemini-4-neon-high': {
      inputPer1M: 0.3,
      cacheReadPer1M: 0.075,
      outputPer1M: 2.5,
    },
  },
};

describe('format helpers', () => {
  it('formats model ids into human-readable names', () => {
    expect(formatModelName('gemini-4-hydrogen-high')).toBe('Gemini 4 Hydrogen (High)');
    expect(formatModelName('gemini-4-hydrogen-tiered-high')).toBe(
      'Gemini 4 Hydrogen Tiered (High)',
    );
    expect(formatModelName('gemini-4-hydrogen-medium')).toBe('Gemini 4 Hydrogen (Medium)');
    expect(formatModelName('')).toBe('Unknown Model');
  });

  it('formats currencies and compact numbers properly', () => {
    expect(formatCurrency(25.37, 'CNY')).toBe('¥25.37');
    expect(formatCurrency(3.5, 'USD')).toBe('$3.50');
    expect(formatCurrency(0.0024, 'USD')).toBe('$0.0024');
    expect(formatCompactNumber(200_000_000)).toBe('200M');
    expect(formatCompactNumber(150_000)).toBe('150K');
    expect(formatCompactNumber(1_250_000)).toBe('1.3M');
  });
});

describe('aggregateUsageData', () => {
  // 固定本地参考时间：2026-11-24 15:00:00（本地时区）
  const now = new Date(2026, 10, 24, 15, 0, 0, 0);

  it('switches KPI, trend series, model breakdowns, and sessions between non_cached and total tokenMode', () => {
    const usage = createSampleUsage();

    const nonCached = aggregateUsageData(
      usage,
      samplePricing,
      {
        timeRange: '7d',
        customStartDate: '',
        customEndDate: '',
        project: 'ALL',
        tokenMode: 'non_cached',
      },
      now,
    );

    // 7d 包含 s1 (100k+10k) 与 s2 (200k+50k) -> 非缓存 360,000；含缓存 360,000 + 300,000 = 660,000
    expect(nonCached.kpi.nonCachedTokens).toBe(360_000);
    expect(nonCached.kpi.displayTokens).toBe(360_000);
    expect(nonCached.kpi.totalRequests).toBe(2); // s1:1 与 s2:1，s1:2 为 ERROR_MESSAGE 不计入请求数
    expect(nonCached.kpi.errorCount).toBe(2); // s1:2 (ERROR_MESSAGE) + s2:1 (status ERROR)
    expect(nonCached.kpi.activeSessions).toBe(2);
    expect(nonCached.kpi.coveredProjects).toBe(2);

    // 7d 连续生成 7 天桶
    expect(nonCached.granularity).toBe('day');
    expect(nonCached.trendSeries).toHaveLength(7);
    const totalTrendNonCached = nonCached.trendSeries.reduce(
      (sum, b) => sum + b.total.tokens,
      0,
    );
    expect(totalTrendNonCached).toBe(360_000);

    // 切换为含缓存口径
    const withCache = aggregateUsageData(
      usage,
      samplePricing,
      {
        timeRange: '7d',
        customStartDate: '',
        customEndDate: '',
        project: 'ALL',
        tokenMode: 'total',
      },
      now,
    );

    expect(withCache.kpi.displayTokens).toBe(660_000);
    expect(withCache.kpi.totalWithCacheTokens).toBe(660_000);
    const totalTrendWithCache = withCache.trendSeries.reduce(
      (sum, b) => sum + b.total.tokens,
      0,
    );
    expect(totalTrendWithCache).toBe(660_000);

    // 会话排序在 non_cached 下 s2 (250k) > s1 (110k)，在 total 下 s1 (410k) > s2 (250k)
    expect(nonCached.topSessions[0].sessionId).toBe('s2');
    expect(nonCached.topSessions[0].displayTokens).toBe(250_000);
    expect(withCache.topSessions[0].sessionId).toBe('s1');
    expect(withCache.topSessions[0].displayTokens).toBe(410_000);

    // 模型明细同样响应 tokenMode
    const hydrogenNonCached = nonCached.modelBreakdowns.find(
      (m) => m.modelId === 'gemini-4-hydrogen-high',
    );
    const hydrogenWithCache = withCache.modelBreakdowns.find(
      (m) => m.modelId === 'gemini-4-hydrogen-high',
    );
    expect(hydrogenNonCached?.totalTokens).toBe(110_000);
    expect(hydrogenWithCache?.totalTokens).toBe(410_000);
  });

  it('computes cache hit rate, cache savings, fallback pricing, and USD/CNY conversion accurately', () => {
    expect(calculateCacheHitRate(0, 0)).toBe(0);
    expect(calculateCacheHitRate(100_000, 300_000)).toBeCloseTo(0.75, 6);

    const usage = createSampleUsage();
    const unknownEvent = usage.events[2]; // 200k input, 50k output, 0 cacheRead, custom-unknown-model

    // Fallback: input 1.25, cacheRead 0.3125, output 10.0
    // USD cost = (200_000*1.25 + 50_000*10.0) / 1_000_000 = 0.25 + 0.5 = 0.75 USD
    const usdPricing: PricingConfig = { ...samplePricing, currency: 'USD' };
    const usdRes = calculateEventCost(unknownEvent, usdPricing);
    expect(usdRes.cost).toBeCloseTo(0.75, 6);
    expect(usdRes.cacheSaved).toBe(0);

    // CNY rate = 7.2 -> 0.75 * 7.2 = 5.40 CNY
    const cnyRes = calculateEventCost(unknownEvent, samplePricing);
    expect(cnyRes.cost).toBeCloseTo(5.4, 6);

    // s1:1 cost in USD: (100k*1.25 + 300k*0.3125 + 10k*10.0)/1M = (125000 + 93750 + 100000)/1M = 0.31875 USD
    // saved in USD: 300k * (1.25 - 0.3125) / 1M = 0.28125 USD -> *7.2 = 2.025 CNY
    expect(FALLBACK_MODEL_PRICE.inputPer1M).toBe(1.25);
    const s1Usd = calculateEventCost(usage.events[0], usdPricing);
    expect(s1Usd.cost).toBeCloseTo(0.31875, 6);
    expect(s1Usd.cacheSaved).toBeCloseTo(0.28125, 6);

    const aggCny = aggregateUsageData(
      usage,
      samplePricing,
      {
        timeRange: '7d',
        customStartDate: '',
        customEndDate: '',
        project: 'ALL',
        tokenMode: 'non_cached',
      },
      now,
    );
    // 7d total cost = (0.31875 + 0.75) * 7.2 = 7.695 CNY
    expect(aggCny.kpi.totalCost).toBeCloseTo(7.695, 6);
    expect(aggCny.kpi.totalCacheSaved).toBeCloseTo(0.28125 * 7.2, 6);
    // 7d cache hit rate = 300k / (300k + 300k) = 0.5
    expect(aggCny.kpi.cacheHitRate).toBeCloseTo(0.5, 6);
  });

  it('filters accurately by today (hourly buckets), custom date range, and Outside of Project', () => {
    const usage = createSampleUsage();

    const todayRes = aggregateUsageData(
      usage,
      samplePricing,
      {
        timeRange: 'today',
        customStartDate: '',
        customEndDate: '',
        project: 'ALL',
        tokenMode: 'non_cached',
      },
      now,
    );

    expect(todayRes.granularity).toBe('hour');
    expect(todayRes.trendSeries).toHaveLength(24);
    expect(todayRes.filteredEvents.map((e) => e.id)).toEqual(['s1:1', 's1:2']);
    expect(todayRes.kpi.activeSessions).toBe(1);

    // 过滤 Outside of Project + all time
    const outsideRes = aggregateUsageData(
      usage,
      samplePricing,
      {
        timeRange: 'all',
        customStartDate: '',
        customEndDate: '',
        project: 'Outside of Project',
        tokenMode: 'non_cached',
      },
      now,
    );
    expect(outsideRes.filteredEvents.map((e) => e.id)).toEqual(['s2:1']);
    expect(outsideRes.kpi.coveredProjects).toBe(1);

    // 自定义起止日期（含反序日期容错）
    const customRes = aggregateUsageData(
      usage,
      samplePricing,
      {
        timeRange: 'custom',
        customStartDate: '2026-11-12',
        customEndDate: '2026-11-09',
        project: 'ALL',
        tokenMode: 'total',
      },
      now,
    );
    expect(customRes.filteredEvents.map((e) => e.id)).toEqual(['s3:1']);
    expect(customRes.kpi.displayTokens).toBe(1_020_000);
  });
});

describe('exportData', () => {
  const now = new Date(2026, 10, 24, 15, 0, 0, 0);

  it('generates UTF-8 BOM CSV with escaped commas/quotes/newlines and matching tokenMode', () => {
    const usage = createSampleUsage();
    const filters = {
      timeRange: 'today' as const,
      customStartDate: '',
      customEndDate: '',
      project: 'ALL',
      tokenMode: 'total' as const,
    };
    const agg = aggregateUsageData(usage, samplePricing, filters, now);
    const csv = generateCsvExport(agg, usage, samplePricing, filters);

    expect(csv.startsWith('\uFEFF')).toBe(true);
    // 会话标题包含逗号和双引号，需正确转义
    expect(csv).toContain('"Monitor, ""UI"" Build"');
    // 错误信息包含双引号和换行，需正确转义
    expect(csv).toContain('"API timeout, ""retry"" failed\nline2"');
    // 含缓存口径下 s1:1 的 display_tokens 为 410000
    expect(csv).toContain(',total,410000,100000,10000,300000,');
  });

  it('generates JSON export aligned with current filters and tokenMode', () => {
    const usage = createSampleUsage();
    const filters = {
      timeRange: '7d' as const,
      customStartDate: '',
      customEndDate: '',
      project: 'antigravity-moniter',
      tokenMode: 'non_cached' as const,
    };
    const agg = aggregateUsageData(usage, samplePricing, filters, now);
    const jsonStr = generateJsonExport(
      agg,
      usage,
      samplePricing,
      filters,
      '2026-11-24T07:00:00.000Z',
    );
    const parsed = JSON.parse(jsonStr);

    expect(parsed.filters.project).toBe('antigravity-moniter');
    expect(parsed.filters.tokenMode).toBe('non_cached');
    expect(parsed.summary.displayTokens).toBe(110_000);
    expect(parsed.sessions).toHaveLength(1);
    expect(parsed.sessions[0].displayTokens).toBe(110_000);
    expect(parsed.events).toHaveLength(2);
    expect(parsed.events[0].displayTokens).toBe(110_000);
  });
});
