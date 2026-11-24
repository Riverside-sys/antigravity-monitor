// @vitest-environment node
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  OUTSIDE_OF_PROJECT,
  clearTranscriptCache,
  parseWorkspaceUris,
  readAntigravityUsage,
} from '../antigravityReader';
import {
  ConfigValidationError,
  readDataSourceConfig,
  validateAndSaveDataSourceConfig,
} from '../configStore';
import {
  PricingValidationError,
  getDefaultPricing,
  readPricing,
  validateAndSavePricing,
} from '../pricingStore';
import { createApiMiddleware } from '../viteApiPlugin';

const tempDirs: string[] = [];

async function createTempDir(prefix = 'ag-mon-test-'): Promise<string> {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function writeTranscript(
  root: string,
  sessionId: string,
  lines: unknown[],
  rawSuffix = ''
): Promise<string> {
  const logsDir = path.join(root, 'brain', sessionId, '.system_generated', 'logs');
  await fs.promises.mkdir(logsDir, { recursive: true });
  const filePath = path.join(logsDir, 'transcript.jsonl');
  const content =
    lines.map((line) => (typeof line === 'string' ? line : JSON.stringify(line))).join('\n') +
    (rawSuffix ? `\n${rawSuffix}` : '') +
    '\n';
  await fs.promises.writeFile(filePath, content, 'utf-8');
  return filePath;
}

function createSummaryDb(
  dbPath: string,
  rows: Array<{
    conversation_id: string;
    title?: string;
    step_count?: number;
    last_modified_time?: string;
    workspace_uris?: string;
    status?: string;
    source?: string;
    project_id?: string;
    agent_name?: string;
    parent_conversation_id?: string;
    nesting_depth?: number;
    raw_summary?: Buffer;
  }>
): void {
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(`
      CREATE TABLE conversation_summaries (
        conversation_id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '',
        step_count INTEGER NOT NULL DEFAULT 0,
        last_modified_time TEXT NOT NULL DEFAULT '',
        workspace_uris TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT '',
        project_id TEXT NOT NULL DEFAULT '',
        agent_name TEXT NOT NULL DEFAULT '',
        parent_conversation_id TEXT NOT NULL DEFAULT '',
        nesting_depth INTEGER NOT NULL DEFAULT 0,
        raw_summary BLOB
      );
    `);

    const insert = db.prepare(`
      INSERT INTO conversation_summaries (
        conversation_id, title, step_count, last_modified_time, workspace_uris,
        status, source, project_id, agent_name, parent_conversation_id, nesting_depth, raw_summary
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const row of rows) {
      insert.run(
        row.conversation_id,
        row.title ?? '',
        row.step_count ?? 0,
        row.last_modified_time ?? '',
        row.workspace_uris ?? '',
        row.status ?? '',
        row.source ?? '',
        row.project_id ?? '',
        row.agent_name ?? '',
        row.parent_conversation_id ?? '',
        row.nesting_depth ?? 0,
        row.raw_summary ?? Buffer.from([1, 2, 3])
      );
    }
  } finally {
    db.close();
  }
}

function invokeMiddleware(
  middleware: ReturnType<typeof createApiMiddleware>,
  method: string,
  url: string,
  body?: string
): Promise<{
  calledNext: boolean;
  statusCode: number;
  headers: Record<string, string>;
  bodyText: string;
}> {
  return new Promise((resolve, reject) => {
    const req = new EventEmitter() as IncomingMessage;
    req.method = method;
    req.url = url;

    const headers: Record<string, string> = {};
    const chunks: Buffer[] = [];
    let resolved = false;

    const res = {
      statusCode: 200,
      setHeader(name: string, value: string | number | readonly string[]) {
        headers[name.toLowerCase()] = Array.isArray(value)
          ? value.join(', ')
          : String(value);
        return this;
      },
      end(chunk?: string | Buffer) {
        if (chunk !== undefined) {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk, 'utf-8') : chunk);
        }
        if (!resolved) {
          resolved = true;
          resolve({
            calledNext: false,
            statusCode: res.statusCode,
            headers,
            bodyText: Buffer.concat(chunks).toString('utf-8'),
          });
        }
        return this;
      },
    } as unknown as ServerResponse;

    middleware(req, res, () => {
      if (!resolved) {
        resolved = true;
        resolve({
          calledNext: true,
          statusCode: res.statusCode,
          headers,
          bodyText: '',
        });
      }
    });

    process.nextTick(() => {
      if (body !== undefined) {
        req.emit('data', Buffer.from(body, 'utf-8'));
      }
      req.emit('end');
    });

    req.on('error', reject);
  });
}

beforeEach(() => {
  clearTranscriptCache();
});

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await fs.promises.rm(dir, { recursive: true, force: true });
    }
  }
});

describe('antigravityReader', () => {
  it('parses PLANNER_RESPONSE, ERROR_MESSAGE, workspace_uris, title fallbacks, and legacy .pb counts', async () => {
    const root = await createTempDir();

    const s1 = '11111111-1111-1111-1111-111111111111';
    const s2 = '22222222-2222-2222-2222-222222222222';
    const s3 = '33333333-3333-3333-3333-333333333333';
    const legacyPbId = '44444444-4444-4444-4444-444444444444';

    await writeTranscript(
      root,
      s1,
      [
        {
          step_index: 0,
          type: 'USER_INPUT',
          created_at: '2026-11-23T10:00:00Z',
          content: 'huge user prompt that should not be retained',
        },
        {
          step_index: 1,
          type: 'PLANNER_RESPONSE',
          status: 'DONE',
          created_at: '2026-11-23T10:01:00Z',
          model: 'gemini-4-hydrogen-high',
          input_tokens: 1500,
          cache_read_tokens: 500,
          output_tokens: 200,
          thinking: 'very long thinking block should be dropped',
          content: 'very long response content should be dropped',
          tool_calls: [{ name: 'read_file' }, { name: 'edit_file' }],
        },
        {
          step_index: 2,
          type: 'GENERIC',
          created_at: '2026-11-23T10:02:00Z',
        },
      ],
      '{invalid json line that must be ignored'
    );

    await writeTranscript(root, s2, [
      {
        step_index: 0,
        type: 'ERROR_MESSAGE',
        status: 'ERROR',
        error: 'API error: 429 rate limited',
        created_at: '2026-11-23T09:00:00Z',
      },
      {
        step_index: 1,
        type: 'PLANNER_RESPONSE',
        status: 'DONE',
        model: 'gemini-4-neon-high',
        input_tokens: 300,
        cache_read_tokens: 0,
        output_tokens: 50,
        // Intentionally omit created_at to test fallback to file mtime
      },
    ]);

    // s3 is NOT in conversation_summaries.db
    await writeTranscript(root, s3, [
      {
        step_index: 5,
        type: 'CUSTOM_MODEL_STEP',
        status: 'DONE',
        created_at: '2026-11-24T01:00:00Z',
        model: 'gemini-4-argon-high',
        input_tokens: 100,
        cache_read_tokens: 20,
        output_tokens: 10,
      },
    ]);

    createSummaryDb(path.join(root, 'conversation_summaries.db'), [
      {
        conversation_id: s1,
        title: '监控面板开发',
        workspace_uris: JSON.stringify([
          'file:///d%3A/a_study/CUMT/%E5%89%8D%E7%AB%AF%E5%AD%A6%E4%B9%A0/antigravity-moniter',
        ]),
        raw_summary: Buffer.from('large binary blob'),
      },
      {
        conversation_id: s2,
        title: '',
        agent_name: 'teamwork_orchestrator',
        parent_conversation_id: s1,
        workspace_uris: '',
      },
    ]);

    // Create conversations/*.pb: one matching s1 (not legacy), one legacy
    const convDir = path.join(root, 'conversations');
    await fs.promises.mkdir(convDir, { recursive: true });
    await fs.promises.writeFile(path.join(convDir, `${s1}.pb`), 'dummy');
    await fs.promises.writeFile(path.join(convDir, `${legacyPbId}.pb`), 'dummy');
    await fs.promises.writeFile(path.join(convDir, 'ignore.txt'), 'not pb');

    const result = await readAntigravityUsage(root);

    expect(result.coverage.dbAvailable).toBe(true);
    expect(result.coverage.scannedSessions).toBe(3);
    expect(result.coverage.totalPbFiles).toBe(2);
    expect(result.coverage.legacyPbSessions).toBe(1);

    // Events sorted ascending by createdAt, empty model excluded from models list
    expect(result.events).toHaveLength(4);
    expect(result.events[0].sessionId).toBe(s2);
    expect(result.events[0].type).toBe('ERROR_MESSAGE');
    expect(result.events[0].model).toBe('');
    expect(result.events[0].error).toBe('API error: 429 rate limited');

    const s1Event = result.events.find((e) => e.sessionId === s1)!;
    expect(s1Event.id).toBe(`${s1}:1`);
    expect(s1Event.inputTokens).toBe(1500);
    expect(s1Event.cacheReadTokens).toBe(500);
    expect(s1Event.outputTokens).toBe(200);
    expect(s1Event.toolCallsCount).toBe(2);
    expect('thinking' in s1Event).toBe(false);
    expect('content' in s1Event).toBe(false);

    // Fallback createdAt for event without created_at
    const s2MissingTsEvent = result.events.find(
      (e) => e.sessionId === s2 && e.stepIndex === 1
    )!;
    expect(Number.isFinite(Date.parse(s2MissingTsEvent.createdAt))).toBe(true);

    // Models list must not include ''
    expect(result.models).toEqual([
      'gemini-4-argon-high',
      'gemini-4-hydrogen-high',
      'gemini-4-neon-high',
    ]);

    // Session metadata & title fallbacks
    expect(result.sessions[s1].title).toBe('监控面板开发');
    expect(result.sessions[s1].projectName).toBe('antigravity-moniter');
    expect(result.sessions[s1].workspaceUris).toEqual([
      'd:/a_study/CUMT/前端学习/antigravity-moniter',
    ]);

    expect(result.sessions[s2].title).toBe('[teamwork_orchestrator] 22222222');
    expect(result.sessions[s2].projectName).toBe(OUTSIDE_OF_PROJECT);
    expect(result.sessions[s2].parentConversationId).toBe(s1);

    expect(result.sessions[s3].title).toBe('Session 33333333');
    expect(result.sessions[s3].projectName).toBe(OUTSIDE_OF_PROJECT);
    expect(result.sessions[s3].hasTranscript).toBe(true);

    // Projects list sorted with Outside of Project placed at the end
    expect(result.projects).toEqual(['antigravity-moniter', OUTSIDE_OF_PROJECT]);
  });

  it('degrades gracefully when conversation_summaries.db is missing or corrupted', async () => {
    const root = await createTempDir();
    const s1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    await writeTranscript(root, s1, [
      {
        step_index: 1,
        type: 'PLANNER_RESPONSE',
        created_at: '2026-11-24T02:00:00Z',
        model: 'gemini-4-hydrogen-medium',
        input_tokens: 100,
        output_tokens: 20,
        cache_read_tokens: 0,
      },
    ]);

    // Write invalid sqlite file
    await fs.promises.writeFile(
      path.join(root, 'conversation_summaries.db'),
      'not a valid sqlite database'
    );

    const result = await readAntigravityUsage(root);
    expect(result.coverage.dbAvailable).toBe(false);
    expect(result.coverage.scannedSessions).toBe(1);
    expect(result.events).toHaveLength(1);
    expect(result.sessions[s1].title).toBe('Session aaaaaaaa');
    expect(result.sessions[s1].projectName).toBe(OUTSIDE_OF_PROJECT);
  });

  it('uses mtime+size cache and invalidates when transcript.jsonl changes', async () => {
    const root = await createTempDir();
    const s1 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

    const filePath = await writeTranscript(root, s1, [
      {
        step_index: 1,
        type: 'PLANNER_RESPONSE',
        created_at: '2026-11-24T03:00:00Z',
        model: 'gemini-4-hydrogen-high',
        input_tokens: 100,
        output_tokens: 10,
        cache_read_tokens: 0,
      },
    ]);

    const first = await readAntigravityUsage(root);
    expect(first.events).toHaveLength(1);

    // Second read with unchanged file hits cache
    const second = await readAntigravityUsage(root);
    expect(second.events).toHaveLength(1);

    // Append another event -> size & mtime change -> cache invalidates
    await fs.promises.appendFile(
      filePath,
      JSON.stringify({
        step_index: 2,
        type: 'PLANNER_RESPONSE',
        created_at: '2026-11-24T03:05:00Z',
        model: 'gemini-4-hydrogen-high',
        input_tokens: 200,
        output_tokens: 30,
        cache_read_tokens: 50,
      }) + '\n',
      'utf-8'
    );

    const third = await readAntigravityUsage(root);
    expect(third.events).toHaveLength(2);
    expect(third.events[1].inputTokens).toBe(200);
  });

  it('decodes Windows backslash and encoded workspace_uris accurately', () => {
    expect(
      parseWorkspaceUris('["file:///C%3A\\\\workspace\\\\my%20app/"]')
    ).toEqual({
      workspaceUris: ['C:/workspace/my app'],
      projectName: 'my app',
    });

    expect(parseWorkspaceUris('not-json')).toEqual({
      workspaceUris: [],
      projectName: OUTSIDE_OF_PROJECT,
    });
  });
});

describe('pricingStore', () => {
  it('returns default pricing without creating a file when pricing.json is missing', async () => {
    const dir = await createTempDir();
    const pricingPath = path.join(dir, 'data', 'pricing.json');

    const config = await readPricing(pricingPath);
    expect(config).toEqual(getDefaultPricing());
    expect(fs.existsSync(pricingPath)).toBe(false);
  });

  it('validates, persists, and merges saved pricing configuration', async () => {
    const dir = await createTempDir();
    const pricingPath = path.join(dir, 'nested', 'pricing.json');

    const saved = await validateAndSavePricing(
      {
        currency: 'USD',
        usdToCnyRate: 7.35,
        models: {
          'gemini-4-hydrogen-high': {
            inputPer1M: 1.8,
            cacheReadPer1M: 0.45,
            outputPer1M: 11.0,
          },
          'custom-model-v1': {
            inputPer1M: 0.5,
            cacheReadPer1M: 0.1,
            outputPer1M: 2.0,
          },
        },
      },
      pricingPath
    );

    expect(saved.currency).toBe('USD');
    expect(saved.usdToCnyRate).toBe(7.35);
    expect(typeof saved.updatedAt).toBe('string');
    expect(fs.existsSync(pricingPath)).toBe(true);

    const reloaded = await readPricing(pricingPath);
    expect(reloaded.currency).toBe('USD');
    expect(reloaded.usdToCnyRate).toBe(7.35);
    expect(reloaded.models['gemini-4-hydrogen-high'].inputPer1M).toBe(1.8);
    expect(reloaded.models['custom-model-v1'].outputPer1M).toBe(2.0);
    // Default models not specified in saved file are preserved via merge
    expect(reloaded.models['gemini-4-neon-high']).toEqual(
      getDefaultPricing().models['gemini-4-neon-high']
    );
  });

  it('rejects invalid currency, non-positive rate, and negative or non-finite prices', async () => {
    const dir = await createTempDir();
    const pricingPath = path.join(dir, 'pricing.json');

    await expect(
      validateAndSavePricing(
        { currency: 'EUR', usdToCnyRate: 7.2, models: {} },
        pricingPath
      )
    ).rejects.toBeInstanceOf(PricingValidationError);

    await expect(
      validateAndSavePricing(
        { currency: 'CNY', usdToCnyRate: 0, models: {} },
        pricingPath
      )
    ).rejects.toBeInstanceOf(PricingValidationError);

    await expect(
      validateAndSavePricing(
        {
          currency: 'CNY',
          usdToCnyRate: 7.2,
          models: {
            'bad-model': {
              inputPer1M: -1,
              cacheReadPer1M: 0.1,
              outputPer1M: 1,
            },
          },
        },
        pricingPath
      )
    ).rejects.toBeInstanceOf(PricingValidationError);
  });
});

describe('viteApiPlugin middleware', () => {
  it('handles /api/usage, /api/pricing GET & POST, 400 validation, and passes non-api routes to next()', async () => {
    const root = await createTempDir();
    const pricingPath = path.join(root, 'data', 'pricing.json');
    const s1 = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

    await writeTranscript(root, s1, [
      {
        step_index: 1,
        type: 'PLANNER_RESPONSE',
        created_at: '2026-11-24T05:00:00Z',
        model: 'gemini-4-hydrogen-high',
        input_tokens: 500,
        output_tokens: 100,
        cache_read_tokens: 50,
      },
    ]);

    const middleware = createApiMiddleware({
      dataRoot: root,
      pricingFilePath: pricingPath,
    });

    // Non-API path should pass through
    const passRes = await invokeMiddleware(middleware, 'GET', '/src/App.tsx');
    expect(passRes.calledNext).toBe(true);

    // GET /api/usage
    const usageRes = await invokeMiddleware(middleware, 'GET', '/api/usage?t=1');
    expect(usageRes.calledNext).toBe(false);
    expect(usageRes.statusCode).toBe(200);
    const usageJson = JSON.parse(usageRes.bodyText);
    expect(usageJson.events).toHaveLength(1);
    expect(usageJson.coverage.scannedSessions).toBe(1);

    // GET /api/pricing
    const getPricingRes = await invokeMiddleware(middleware, 'GET', '/api/pricing');
    expect(getPricingRes.statusCode).toBe(200);
    expect(JSON.parse(getPricingRes.bodyText).currency).toBe('CNY');

    // POST /api/pricing (invalid JSON -> 400)
    const badJsonRes = await invokeMiddleware(
      middleware,
      'POST',
      '/api/pricing',
      '{broken'
    );
    expect(badJsonRes.statusCode).toBe(400);

    // POST /api/pricing (invalid payload -> 400)
    const badPayloadRes = await invokeMiddleware(
      middleware,
      'POST',
      '/api/pricing',
      JSON.stringify({ currency: 'JPY', usdToCnyRate: 7.2, models: {} })
    );
    expect(badPayloadRes.statusCode).toBe(400);

    // POST /api/pricing (valid -> 200 and persisted)
    const okRes = await invokeMiddleware(
      middleware,
      'POST',
      '/api/pricing',
      JSON.stringify({
        currency: 'USD',
        usdToCnyRate: 7.1,
        models: {
          'gemini-4-hydrogen-high': {
            inputPer1M: 1.5,
            cacheReadPer1M: 0.3,
            outputPer1M: 9.5,
          },
        },
      })
    );
    expect(okRes.statusCode).toBe(200);
    expect(JSON.parse(okRes.bodyText).currency).toBe('USD');
  });

  it('resolves 3-tier data root priority (config > env > default) and persists /api/config', async () => {
    const baseDir = await createTempDir();
    const envRoot = await createTempDir('ag-env-');
    const customRoot = await createTempDir('ag-custom-');
    const configPath = path.join(baseDir, 'data', 'config.json');

    await writeTranscript(envRoot, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', [
      {
        step_index: 1,
        type: 'PLANNER_RESPONSE',
        created_at: '2026-11-24T01:00:00Z',
        model: 'gemini-4-neon-high',
        input_tokens: 111,
        output_tokens: 22,
        cache_read_tokens: 0,
      },
    ]);

    await writeTranscript(customRoot, 'ffffffff-ffff-ffff-ffff-ffffffffffff', [
      {
        step_index: 1,
        type: 'PLANNER_RESPONSE',
        created_at: '2026-11-24T02:00:00Z',
        model: 'gemini-4-hydrogen-high',
        input_tokens: 333,
        output_tokens: 44,
        cache_read_tokens: 10,
      },
    ]);

    // 1. Default when neither config nor env is set
    const defaultCfg = await readDataSourceConfig({
      configFilePath: configPath,
      env: {},
    });
    expect(defaultCfg.source).toBe('default');

    // 2. Env overrides default
    const envMiddleware = createApiMiddleware({
      configFilePath: configPath,
      env: { ANTIGRAVITY_DATA_DIR: envRoot },
    });

    const envCfgRes = await invokeMiddleware(envMiddleware, 'GET', '/api/config');
    expect(envCfgRes.statusCode).toBe(200);
    const envCfgJson = JSON.parse(envCfgRes.bodyText);
    expect(envCfgJson.source).toBe('env');
    expect(envCfgJson.effectiveDataRoot).toBe(path.resolve(envRoot));
    expect(envCfgJson.hasBrainDir).toBe(true);

    const envUsageRes = await invokeMiddleware(envMiddleware, 'GET', '/api/usage');
    expect(envUsageRes.statusCode).toBe(200);
    const envUsage = JSON.parse(envUsageRes.bodyText);
    expect(envUsage.events).toHaveLength(1);
    expect(envUsage.events[0].inputTokens).toBe(111);
    expect(envUsage.coverage.dataRootSource).toBe('env');

    // 3. Invalid custom path returns 400
    const badDirRes = await invokeMiddleware(
      envMiddleware,
      'POST',
      '/api/config',
      JSON.stringify({ customDataRoot: path.join(baseDir, 'does-not-exist') })
    );
    expect(badDirRes.statusCode).toBe(400);

    // 4. Saved custom config overrides env
    const saveCfgRes = await invokeMiddleware(
      envMiddleware,
      'POST',
      '/api/config',
      JSON.stringify({ customDataRoot: customRoot })
    );
    expect(saveCfgRes.statusCode).toBe(200);
    const savedCfg = JSON.parse(saveCfgRes.bodyText);
    expect(savedCfg.source).toBe('config');
    expect(savedCfg.effectiveDataRoot).toBe(path.resolve(customRoot));

    const customUsageRes = await invokeMiddleware(envMiddleware, 'GET', '/api/usage');
    const customUsage = JSON.parse(customUsageRes.bodyText);
    expect(customUsage.events).toHaveLength(1);
    expect(customUsage.events[0].inputTokens).toBe(333);
    expect(customUsage.coverage.dataRootSource).toBe('config');

    // 5. Clearing customDataRoot falls back to env
    const resetRes = await validateAndSaveDataSourceConfig(
      { customDataRoot: '' },
      { configFilePath: configPath, env: { ANTIGRAVITY_DATA_DIR: envRoot } }
    );
    expect(resetRes.source).toBe('env');
    await expect(
      validateAndSaveDataSourceConfig({ customDataRoot: 123 }, { configFilePath: configPath })
    ).rejects.toBeInstanceOf(ConfigValidationError);
  });
});
