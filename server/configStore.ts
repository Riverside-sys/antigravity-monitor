import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DataRootSource, DataSourceConfig } from '../src/types';

export const ENV_DATA_DIR_KEY = 'ANTIGRAVITY_DATA_DIR';

interface StoredConfigFile {
  customDataRoot: string;
  updatedAt?: string;
}

export class ConfigValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

export function getDefaultConfigFilePath(): string {
  return path.resolve(process.cwd(), 'data', 'config.json');
}

export function getDefaultAntigravityDataRoot(): string {
  return path.join(os.homedir(), '.gemini', 'antigravity');
}

export function expandHomeDir(inputPath: string): string {
  const trimmed = inputPath.trim();
  if (!trimmed) return '';
  if (trimmed === '~') {
    return os.homedir();
  }
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
    return path.join(os.homedir(), trimmed.slice(2));
  }
  return trimmed;
}

async function inspectDirectory(dirPath: string): Promise<{
  exists: boolean;
  hasBrainDir: boolean;
}> {
  try {
    const stat = await fs.promises.stat(dirPath);
    if (!stat.isDirectory()) {
      return { exists: false, hasBrainDir: false };
    }
  } catch {
    return { exists: false, hasBrainDir: false };
  }

  try {
    const brainStat = await fs.promises.stat(path.join(dirPath, 'brain'));
    return { exists: true, hasBrainDir: brainStat.isDirectory() };
  } catch {
    return { exists: true, hasBrainDir: false };
  }
}

async function readStoredConfig(filePath: string): Promise<StoredConfigFile> {
  let raw: string;
  try {
    raw = await fs.promises.readFile(filePath, 'utf-8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') {
      return { customDataRoot: '' };
    }
    throw err;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      typeof (parsed as Record<string, unknown>).customDataRoot === 'string'
    ) {
      const obj = parsed as Record<string, unknown>;
      return {
        customDataRoot: (obj.customDataRoot as string).trim(),
        ...(typeof obj.updatedAt === 'string' && obj.updatedAt.trim()
          ? { updatedAt: obj.updatedAt.trim() }
          : {}),
      };
    }
  } catch {
    // Ignore invalid JSON and fall back cleanly
  }

  return { customDataRoot: '' };
}

export async function readDataSourceConfig(options?: {
  configFilePath?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<DataSourceConfig> {
  const configFilePath = options?.configFilePath ?? getDefaultConfigFilePath();
  const env = options?.env ?? process.env;

  const stored = await readStoredConfig(configFilePath);
  const envRaw =
    typeof env[ENV_DATA_DIR_KEY] === 'string'
      ? env[ENV_DATA_DIR_KEY].trim()
      : '';
  const defaultDataRoot = getDefaultAntigravityDataRoot();

  let effectiveRaw = defaultDataRoot;
  let source: DataRootSource = 'default';

  if (stored.customDataRoot) {
    effectiveRaw = stored.customDataRoot;
    source = 'config';
  } else if (envRaw) {
    effectiveRaw = envRaw;
    source = 'env';
  }

  const effectiveDataRoot = path.resolve(expandHomeDir(effectiveRaw));
  const { exists, hasBrainDir } = await inspectDirectory(effectiveDataRoot);

  return {
    customDataRoot: stored.customDataRoot,
    envDataRoot: envRaw ? path.resolve(expandHomeDir(envRaw)) : '',
    defaultDataRoot,
    effectiveDataRoot,
    source,
    exists,
    hasBrainDir,
    ...(stored.updatedAt ? { updatedAt: stored.updatedAt } : {}),
  };
}

export async function validateAndSaveDataSourceConfig(
  payload: unknown,
  options?: {
    configFilePath?: string;
    env?: NodeJS.ProcessEnv;
  }
): Promise<DataSourceConfig> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ConfigValidationError('Config payload must be a JSON object.');
  }

  const rawDir = (payload as Record<string, unknown>).customDataRoot;
  if (typeof rawDir !== 'string') {
    throw new ConfigValidationError('customDataRoot must be a string.');
  }

  const trimmed = rawDir.trim();
  let normalizedToSave = '';

  if (trimmed) {
    const resolved = path.resolve(expandHomeDir(trimmed));
    let stat: fs.Stats;
    try {
      stat = await fs.promises.stat(resolved);
    } catch {
      throw new ConfigValidationError(
        `目录不存在或无访问权限：${resolved}`
      );
    }
    if (!stat.isDirectory()) {
      throw new ConfigValidationError(
        `指定路径不是文件夹：${resolved}`
      );
    }
    normalizedToSave = resolved;
  }

  const configFilePath = options?.configFilePath ?? getDefaultConfigFilePath();
  await fs.promises.mkdir(path.dirname(configFilePath), { recursive: true });
  const toPersist: StoredConfigFile = {
    customDataRoot: normalizedToSave,
    updatedAt: new Date().toISOString(),
  };
  await fs.promises.writeFile(
    configFilePath,
    `${JSON.stringify(toPersist, null, 2)}\n`,
    'utf-8'
  );

  return readDataSourceConfig(options);
}
