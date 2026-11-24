import fs from 'node:fs';
import path from 'node:path';
import type { CurrencyCode, ModelPrice, PricingConfig } from '../src/types';

export const DEFAULT_MODEL_FALLBACK_PRICE: ModelPrice = {
  inputPer1M: 1.25,
  cacheReadPer1M: 0.3125,
  outputPer1M: 10.0,
};

const DEFAULT_PRICING: PricingConfig = {
  currency: 'CNY',
  usdToCnyRate: 7.2,
  models: {
    'gemini-4-hydrogen-high': {
      inputPer1M: 1.25,
      cacheReadPer1M: 0.3125,
      outputPer1M: 10.0,
    },
    'gemini-4-hydrogen-medium': {
      inputPer1M: 0.6,
      cacheReadPer1M: 0.15,
      outputPer1M: 4.0,
    },
    'gemini-4-hydrogen-tiered-high': {
      inputPer1M: 1.5,
      cacheReadPer1M: 0.375,
      outputPer1M: 12.0,
    },
    'gemini-4-neon-high': {
      inputPer1M: 0.3,
      cacheReadPer1M: 0.075,
      outputPer1M: 2.5,
    },
    'gemini-4-argon-high': {
      inputPer1M: 2.0,
      cacheReadPer1M: 0.5,
      outputPer1M: 12.0,
    },
  },
};

export class PricingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PricingValidationError';
  }
}

export function getDefaultPricingFilePath(): string {
  return path.resolve(process.cwd(), 'data', 'pricing.json');
}

export function getDefaultPricing(): PricingConfig {
  const models: Record<string, ModelPrice> = {};
  for (const [modelId, price] of Object.entries(DEFAULT_PRICING.models)) {
    models[modelId] = { ...price };
  }
  return {
    currency: DEFAULT_PRICING.currency,
    usdToCnyRate: DEFAULT_PRICING.usdToCnyRate,
    models,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isValidCurrency(value: unknown): value is CurrencyCode {
  return value === 'CNY' || value === 'USD';
}

export async function readPricing(
  filePath: string = getDefaultPricingFilePath()
): Promise<PricingConfig> {
  const defaults = getDefaultPricing();

  let rawContent: string;
  try {
    rawContent = await fs.promises.readFile(filePath, 'utf-8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') {
      return defaults;
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    return defaults;
  }

  if (!isPlainObject(parsed)) {
    return defaults;
  }

  const merged: PricingConfig = {
    currency: isValidCurrency(parsed.currency)
      ? parsed.currency
      : defaults.currency,
    usdToCnyRate: isPositiveFiniteNumber(parsed.usdToCnyRate)
      ? parsed.usdToCnyRate
      : defaults.usdToCnyRate,
    models: { ...defaults.models },
    ...(typeof parsed.updatedAt === 'string' && parsed.updatedAt.trim()
      ? { updatedAt: parsed.updatedAt.trim() }
      : {}),
  };

  if (isPlainObject(parsed.models)) {
    for (const [modelId, rawPrice] of Object.entries(parsed.models)) {
      if (!modelId.trim() || !isPlainObject(rawPrice)) continue;
      if (
        isNonNegativeFiniteNumber(rawPrice.inputPer1M) &&
        isNonNegativeFiniteNumber(rawPrice.cacheReadPer1M) &&
        isNonNegativeFiniteNumber(rawPrice.outputPer1M)
      ) {
        merged.models[modelId] = {
          inputPer1M: rawPrice.inputPer1M,
          cacheReadPer1M: rawPrice.cacheReadPer1M,
          outputPer1M: rawPrice.outputPer1M,
        };
      }
    }
  }

  return merged;
}

export function validatePricingPayload(payload: unknown): PricingConfig {
  if (!isPlainObject(payload)) {
    throw new PricingValidationError('Pricing payload must be a JSON object.');
  }

  if (!isValidCurrency(payload.currency)) {
    throw new PricingValidationError("currency must be 'CNY' or 'USD'.");
  }

  if (!isPositiveFiniteNumber(payload.usdToCnyRate)) {
    throw new PricingValidationError(
      'usdToCnyRate must be a finite number greater than 0.'
    );
  }

  if (!isPlainObject(payload.models)) {
    throw new PricingValidationError('models must be an object.');
  }

  const normalizedModels: Record<string, ModelPrice> = {};
  for (const [modelId, rawPrice] of Object.entries(payload.models)) {
    if (!modelId.trim()) {
      throw new PricingValidationError('Model ID must be a non-empty string.');
    }
    if (!isPlainObject(rawPrice)) {
      throw new PricingValidationError(
        `Price entry for model "${modelId}" must be an object.`
      );
    }
    if (!isNonNegativeFiniteNumber(rawPrice.inputPer1M)) {
      throw new PricingValidationError(
        `models["${modelId}"].inputPer1M must be a finite number >= 0.`
      );
    }
    if (!isNonNegativeFiniteNumber(rawPrice.cacheReadPer1M)) {
      throw new PricingValidationError(
        `models["${modelId}"].cacheReadPer1M must be a finite number >= 0.`
      );
    }
    if (!isNonNegativeFiniteNumber(rawPrice.outputPer1M)) {
      throw new PricingValidationError(
        `models["${modelId}"].outputPer1M must be a finite number >= 0.`
      );
    }

    normalizedModels[modelId] = {
      inputPer1M: rawPrice.inputPer1M,
      cacheReadPer1M: rawPrice.cacheReadPer1M,
      outputPer1M: rawPrice.outputPer1M,
    };
  }

  return {
    currency: payload.currency,
    usdToCnyRate: payload.usdToCnyRate,
    models: normalizedModels,
    updatedAt: new Date().toISOString(),
  };
}

export async function validateAndSavePricing(
  payload: unknown,
  filePath: string = getDefaultPricingFilePath()
): Promise<PricingConfig> {
  const normalized = validatePricingPayload(payload);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(
    filePath,
    `${JSON.stringify(normalized, null, 2)}\n`,
    'utf-8'
  );
  return normalized;
}
