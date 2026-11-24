export type CurrencyCode = 'CNY' | 'USD';

export type TimeRangePreset = 'today' | '7d' | '30d' | 'all' | 'custom';

export type TokenMode = 'non_cached' | 'total';

export type KpiViewMode = 'all' | 'cost' | 'cache';

export type TrendMetric = 'cost' | 'tokens' | 'requests';

export type TrendGroupBy = 'model' | 'project';

export interface UsageEvent {
  /** 唯一标识，格式建议 `${sessionId}:${stepIndex}` */
  id: string;
  /** 所属会话 UUID（来自 brain/<sessionId> 目录名） */
  sessionId: string;
  /** transcript.jsonl 中的 step_index */
  stepIndex: number;
  /** 事件类型，主要为 'PLANNER_RESPONSE'（模型请求）或 'ERROR_MESSAGE'（API 请求失败） */
  type: string;
  /** 模型 ID（如 'gemini-4-hydrogen-high'），错误事件可能为空字符串 */
  model: string;
  /** 非缓存输入 token 数（对应 transcript.jsonl 的 input_tokens） */
  inputTokens: number;
  /** 输出 token 数（对应 transcript.jsonl 的 output_tokens） */
  outputTokens: number;
  /** 缓存命中读取 token 数（对应 transcript.jsonl 的 cache_read_tokens） */
  cacheReadTokens: number;
  /** 事件创建时间戳（ISO 8601 UTC 字符串，对应 created_at） */
  createdAt: string;
  /** 状态：'DONE' | 'RUNNING' | 'ERROR' 等 */
  status: string;
  /** 错误信息（如有） */
  error?: string;
  /** 该步触发的工具调用次数（tool_calls 数组长度，无则为 0） */
  toolCallsCount: number;
}

export interface SessionSummary {
  /** 会话 UUID */
  sessionId: string;
  /** 用于前端展示的会话标题（若数据库 title 为空，则提供合理兜底） */
  title: string;
  /** 数据库中原始 title 字段（可能为空字符串） */
  rawTitle?: string;
  /** 子代理名称（如 teamwork_orchestrator），主会话为空字符串 */
  agentName?: string;
  /** 父会话 UUID（若为子代理会话） */
  parentConversationId?: string;
  /** 解析后的工作区 URI 或路径列表 */
  workspaceUris: string[];
  /** 提取的项目名称；未归属项目的会话统一为 'Outside of Project' */
  projectName: string;
  /** 会话最后活跃时间（ISO 8601） */
  lastActiveAt: string;
  /** 会话首次活跃时间（ISO 8601） */
  firstActiveAt: string;
  /** 是否存在 transcript.jsonl */
  hasTranscript: boolean;
}

export type DataRootSource = 'config' | 'env' | 'default';

export interface DataSourceConfig {
  /** 用户在页面保存的自定义目录（为空表示回退到环境变量或默认路径） */
  customDataRoot: string;
  /** 环境变量 ANTIGRAVITY_DATA_DIR（若已设置） */
  envDataRoot: string;
  /** 跨平台默认目录（~/.gemini/antigravity） */
  defaultDataRoot: string;
  /** 当前实际生效的数据根目录 */
  effectiveDataRoot: string;
  /** 当前生效目录的来源 */
  source: DataRootSource;
  /** 生效目录是否存在 */
  exists: boolean;
  /** 生效目录下是否包含 brain 目录 */
  hasBrainDir: boolean;
  /** 配置最后更新时间（ISO 8601） */
  updatedAt?: string;
}

export interface DataCoverage {
  /** 成功扫描并解析的新版 transcript.jsonl 会话数 */
  scannedSessions: number;
  /** 存在于 conversations/*.pb 但无 transcript.jsonl 的早期旧格式会话数 */
  legacyPbSessions: number;
  /** ~/.gemini/antigravity/conversations/*.pb 文件总数 */
  totalPbFiles: number;
  /** conversation_summaries.db 是否成功以只读模式打开 */
  dbAvailable: boolean;
  /** 当前 Node 运行时是否支持内置 node:sqlite */
  sqliteSupported?: boolean;
  /** 当前实际扫描的数据根目录 */
  dataRoot?: string;
  /** 当前实际扫描目录来源 */
  dataRootSource?: DataRootSource;
  /** 本次扫描完成时间（ISO 8601） */
  lastScannedAt: string;
}

export interface UsageApiResponse {
  /** 按 createdAt 升序排列的用量与错误事件明细 */
  events: UsageEvent[];
  /** 以 sessionId 为键的会话元数据映射 */
  sessions: Record<string, SessionSummary>;
  /** 覆盖的所有项目名称列表（已去重排序，含 'Outside of Project'） */
  projects: string[];
  /** 覆盖的所有非空模型 ID 列表（已去重排序） */
  models: string[];
  /** 数据覆盖范围与旧版会话统计 */
  coverage: DataCoverage;
}

export interface ModelPrice {
  /** 每百万 Input Token 单价（USD） */
  inputPer1M: number;
  /** 每百万 Cache Read Token 单价（USD） */
  cacheReadPer1M: number;
  /** 每百万 Output Token 单价（USD） */
  outputPer1M: number;
}

export interface PricingConfig {
  /** 展示币种 */
  currency: CurrencyCode;
  /** USD 转 CNY 汇率（例如 7.2） */
  usdToCnyRate: number;
  /** 各模型 ID 对应的单价配置（USD / 1M tokens） */
  models: Record<string, ModelPrice>;
  /** 配置最后更新时间（ISO 8601） */
  updatedAt?: string;
}
