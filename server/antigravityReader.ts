import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  DataCoverage,
  DataRootSource,
  SessionSummary,
  UsageApiResponse,
  UsageEvent,
} from '../src/types';

type NodeSqliteModule = typeof import('node:sqlite');

let sqliteModulePromise: Promise<NodeSqliteModule | null> | null = null;

async function loadNodeSqlite(): Promise<NodeSqliteModule | null> {
  if (!sqliteModulePromise) {
    sqliteModulePromise = import('node:sqlite').catch(() => null);
  }
  return sqliteModulePromise;
}

export const OUTSIDE_OF_PROJECT = 'Outside of Project';

interface CachedTranscript {
  mtimeMs: number;
  size: number;
  events: UsageEvent[];
  firstActiveAt: string;
  lastActiveAt: string;
}

interface DbSessionRow {
  conversation_id: string;
  title: string | null;
  step_count: number | null;
  last_modified_time: string | null;
  workspace_uris: string | null;
  status: string | null;
  source: string | null;
  project_id: string | null;
  agent_name: string | null;
  parent_conversation_id: string | null;
  nesting_depth: number | null;
}

const transcriptCache = new Map<string, CachedTranscript>();

export function clearTranscriptCache(): void {
  transcriptCache.clear();
}

export function getDefaultDataRoot(): string {
  return path.join(os.homedir(), '.gemini', 'antigravity');
}

function toNonNegativeNumber(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : 0;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }
  return 0;
}

function isUsageOrErrorRecord(obj: Record<string, unknown>): boolean {
  if (obj.type === 'PLANNER_RESPONSE' || obj.type === 'ERROR_MESSAGE') {
    return true;
  }
  if (
    typeof obj.input_tokens === 'number' ||
    typeof obj.output_tokens === 'number' ||
    typeof obj.cache_read_tokens === 'number'
  ) {
    return true;
  }
  if (typeof obj.model === 'string' && obj.model.trim().length > 0) {
    return true;
  }
  return false;
}

function compareIsoTime(a: string, b: string): number {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  const aValid = Number.isFinite(ta);
  const bValid = Number.isFinite(tb);
  if (aValid && bValid && ta !== tb) {
    return ta - tb;
  }
  return a.localeCompare(b);
}

async function parseTranscriptFile(
  transcriptPath: string,
  sessionId: string
): Promise<CachedTranscript> {
  const resolvedPath = path.resolve(transcriptPath);
  const stat = await fs.promises.stat(resolvedPath);
  const cached = transcriptCache.get(resolvedPath);

  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached;
  }

  const fallbackIso = stat.mtime.toISOString();
  const content = await fs.promises.readFile(resolvedPath, 'utf-8');
  const lines = content.split(/\r?\n/);

  const events: UsageEvent[] = [];
  let minTime = '';
  let maxTime = '';

  const trackTime = (iso: string) => {
    if (!iso) return;
    if (!minTime || compareIsoTime(iso, minTime) < 0) {
      minTime = iso;
    }
    if (!maxTime || compareIsoTime(iso, maxTime) > 0) {
      maxTime = iso;
    }
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const rawLine = lines[lineIndex].trim();
    if (!rawLine) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawLine);
    } catch {
      // Ignore malformed JSON lines safely
      continue;
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      continue;
    }

    const obj = parsed as Record<string, unknown>;
    const rawCreatedAt =
      typeof obj.created_at === 'string' && obj.created_at.trim()
        ? obj.created_at.trim()
        : '';

    if (rawCreatedAt) {
      trackTime(rawCreatedAt);
    }

    if (!isUsageOrErrorRecord(obj)) {
      continue;
    }

    const rawStep = Number(obj.step_index);
    const stepIndex = Number.isFinite(rawStep) ? rawStep : lineIndex;
    const type =
      typeof obj.type === 'string' && obj.type.trim()
        ? obj.type.trim()
        : 'UNKNOWN';
    const model = typeof obj.model === 'string' ? obj.model.trim() : '';
    const createdAt = rawCreatedAt || fallbackIso;
    const status =
      typeof obj.status === 'string' && obj.status.trim()
        ? obj.status.trim()
        : 'DONE';
    const error = typeof obj.error === 'string' ? obj.error : undefined;
    const toolCallsCount = Array.isArray(obj.tool_calls)
      ? obj.tool_calls.length
      : 0;

    trackTime(createdAt);

    events.push({
      id: `${sessionId}:${stepIndex}`,
      sessionId,
      stepIndex,
      type,
      model,
      inputTokens: toNonNegativeNumber(obj.input_tokens),
      outputTokens: toNonNegativeNumber(obj.output_tokens),
      cacheReadTokens: toNonNegativeNumber(obj.cache_read_tokens),
      createdAt,
      status,
      ...(error !== undefined ? { error } : {}),
      toolCallsCount,
    });
  }

  const result: CachedTranscript = {
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    events,
    firstActiveAt: minTime || fallbackIso,
    lastActiveAt: maxTime || fallbackIso,
  };

  transcriptCache.set(resolvedPath, result);
  return result;
}

export function parseWorkspaceUris(rawWorkspaceUris: string | null | undefined): {
  workspaceUris: string[];
  projectName: string;
} {
  if (typeof rawWorkspaceUris !== 'string' || !rawWorkspaceUris.trim()) {
    return { workspaceUris: [], projectName: OUTSIDE_OF_PROJECT };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawWorkspaceUris);
  } catch {
    return { workspaceUris: [], projectName: OUTSIDE_OF_PROJECT };
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { workspaceUris: [], projectName: OUTSIDE_OF_PROJECT };
  }

  const normalizedUris: string[] = [];

  for (const item of parsed) {
    if (typeof item !== 'string') continue;
    let uri = item.trim();
    if (!uri) continue;

    if (uri.startsWith('file://')) {
      uri = uri.slice('file://'.length);
    }

    try {
      uri = decodeURIComponent(uri);
    } catch {
      // Keep raw string if URI decoding fails
    }

    uri = uri.replace(/\\/g, '/').replace(/\/+$/, '');
    if (/^\/[A-Za-z]:/.test(uri)) {
      uri = uri.slice(1);
    }
    if (uri) {
      normalizedUris.push(uri);
    }
  }

  if (normalizedUris.length === 0) {
    return { workspaceUris: [], projectName: OUTSIDE_OF_PROJECT };
  }

  const firstPath = normalizedUris[0];
  const segments = firstPath.split('/').filter(Boolean);
  const lastSegment = segments.length > 0 ? segments[segments.length - 1] : '';

  return {
    workspaceUris: normalizedUris,
    projectName: lastSegment || OUTSIDE_OF_PROJECT,
  };
}

async function readConversationSummariesFromDb(dbPath: string): Promise<{
  dbAvailable: boolean;
  sqliteSupported: boolean;
  rowsById: Map<string, DbSessionRow>;
}> {
  const rowsById = new Map<string, DbSessionRow>();
  const sqliteMod = await loadNodeSqlite();
  if (!sqliteMod || typeof sqliteMod.DatabaseSync !== 'function') {
    return { dbAvailable: false, sqliteSupported: false, rowsById };
  }

  if (!fs.existsSync(dbPath)) {
    return { dbAvailable: false, sqliteSupported: true, rowsById };
  }

  let db: InstanceType<NodeSqliteModule['DatabaseSync']> | undefined;
  try {
    db = new sqliteMod.DatabaseSync(dbPath, { readOnly: true });
    const stmt = db.prepare(
      `SELECT conversation_id, title, step_count, last_modified_time, workspace_uris,
              status, source, project_id, agent_name, parent_conversation_id, nesting_depth
       FROM conversation_summaries`
    );
    const rows = stmt.all() as unknown as DbSessionRow[];
    for (const row of rows) {
      if (row && typeof row.conversation_id === 'string' && row.conversation_id) {
        rowsById.set(row.conversation_id, row);
      }
    }
    return { dbAvailable: true, sqliteSupported: true, rowsById };
  } catch {
    return {
      dbAvailable: false,
      sqliteSupported: true,
      rowsById: new Map<string, DbSessionRow>(),
    };
  } finally {
    if (db) {
      try {
        db.close();
      } catch {
        // Ignore close errors
      }
    }
  }
}

async function countPbSessions(
  conversationsDir: string,
  scannedSessionIds: Set<string>
): Promise<{ totalPbFiles: number; legacyPbSessions: number }> {
  try {
    const entries = await fs.promises.readdir(conversationsDir, {
      withFileTypes: true,
    });
    let totalPbFiles = 0;
    let legacyPbSessions = 0;

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.toLowerCase().endsWith('.pb')) continue;
      totalPbFiles += 1;
      const sessionId = entry.name.slice(0, -3);
      if (!scannedSessionIds.has(sessionId)) {
        legacyPbSessions += 1;
      }
    }

    return { totalPbFiles, legacyPbSessions };
  } catch {
    return { totalPbFiles: 0, legacyPbSessions: 0 };
  }
}

export async function readAntigravityUsage(
  dataRoot: string = getDefaultDataRoot(),
  dataRootSource: DataRootSource = 'default'
): Promise<UsageApiResponse> {
  const root = path.resolve(dataRoot);
  const brainDir = path.join(root, 'brain');
  const dbPath = path.join(root, 'conversation_summaries.db');
  const conversationsDir = path.join(root, 'conversations');

  const allEvents: UsageEvent[] = [];
  const sessions: Record<string, SessionSummary> = {};
  const scannedSessionIds = new Set<string>();
  const projectSet = new Set<string>();
  const modelSet = new Set<string>();

  const { dbAvailable, sqliteSupported, rowsById } =
    await readConversationSummariesFromDb(dbPath);

  let brainEntries: fs.Dirent[] = [];
  try {
    brainEntries = await fs.promises.readdir(brainDir, { withFileTypes: true });
  } catch {
    brainEntries = [];
  }

  for (const entry of brainEntries) {
    if (!entry.isDirectory()) continue;
    const sessionId = entry.name;
    const transcriptPath = path.join(
      brainDir,
      sessionId,
      '.system_generated',
      'logs',
      'transcript.jsonl'
    );

    let parsed: CachedTranscript;
    try {
      parsed = await parseTranscriptFile(transcriptPath, sessionId);
    } catch {
      // No transcript.jsonl or unreadable file: skip gracefully
      continue;
    }

    scannedSessionIds.add(sessionId);

    for (const evt of parsed.events) {
      allEvents.push(evt);
      if (evt.model) {
        modelSet.add(evt.model);
      }
    }

    const dbRow = rowsById.get(sessionId);
    const rawTitle = typeof dbRow?.title === 'string' ? dbRow.title : '';
    const agentName =
      typeof dbRow?.agent_name === 'string' ? dbRow.agent_name : '';
    const parentConversationId =
      typeof dbRow?.parent_conversation_id === 'string'
        ? dbRow.parent_conversation_id
        : '';

    const title = rawTitle.trim()
      ? rawTitle.trim()
      : agentName.trim()
        ? `[${agentName.trim()}] ${sessionId.slice(0, 8)}`
        : `Session ${sessionId.slice(0, 8)}`;

    const { workspaceUris, projectName } = parseWorkspaceUris(
      dbRow?.workspace_uris
    );
    projectSet.add(projectName);

    sessions[sessionId] = {
      sessionId,
      title,
      ...(dbRow ? { rawTitle } : {}),
      ...(agentName ? { agentName } : {}),
      ...(parentConversationId ? { parentConversationId } : {}),
      workspaceUris,
      projectName,
      lastActiveAt: parsed.lastActiveAt,
      firstActiveAt: parsed.firstActiveAt,
      hasTranscript: true,
    };
  }

  allEvents.sort((a, b) => {
    const cmp = compareIsoTime(a.createdAt, b.createdAt);
    if (cmp !== 0) return cmp;
    if (a.sessionId !== b.sessionId) {
      return a.sessionId.localeCompare(b.sessionId);
    }
    return a.stepIndex - b.stepIndex;
  });

  const projects = Array.from(projectSet).sort((a, b) => {
    if (a === OUTSIDE_OF_PROJECT && b !== OUTSIDE_OF_PROJECT) return 1;
    if (b === OUTSIDE_OF_PROJECT && a !== OUTSIDE_OF_PROJECT) return -1;
    return a.localeCompare(b);
  });

  const models = Array.from(modelSet).sort((a, b) => a.localeCompare(b));

  const { totalPbFiles, legacyPbSessions } = await countPbSessions(
    conversationsDir,
    scannedSessionIds
  );

  const coverage: DataCoverage = {
    scannedSessions: scannedSessionIds.size,
    legacyPbSessions,
    totalPbFiles,
    dbAvailable,
    sqliteSupported,
    dataRoot: root,
    dataRootSource,
    lastScannedAt: new Date().toISOString(),
  };

  return {
    events: allEvents,
    sessions,
    projects,
    models,
    coverage,
  };
}
