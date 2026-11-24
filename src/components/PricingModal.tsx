import { useEffect, useState } from 'react';
import { Plus, RotateCcw, X } from 'lucide-react';
import type { CurrencyCode, ModelPrice, PricingConfig } from '../types';
import {
  DEFAULT_PRICING_CONFIG,
  FALLBACK_MODEL_PRICE,
} from '../utils/aggregate';
import { formatModelName } from '../utils/format';

interface PricingModalProps {
  isOpen: boolean;
  onClose: () => void;
  pricing: PricingConfig;
  discoveredModels: string[];
  onSave: (nextPricing: PricingConfig) => Promise<void>;
}

export function PricingModal({
  isOpen,
  onClose,
  pricing,
  discoveredModels,
  onSave,
}: PricingModalProps) {
  const [currency, setCurrency] = useState<CurrencyCode>(pricing.currency);
  const [usdToCnyRate, setUsdToCnyRate] = useState<string>(
    String(pricing.usdToCnyRate),
  );
  const [models, setModels] = useState<Record<string, ModelPrice>>({});
  const [newModelId, setNewModelId] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setCurrency(pricing.currency);
    setUsdToCnyRate(String(pricing.usdToCnyRate));

    const merged: Record<string, ModelPrice> = {};
    const allIds = new Set<string>([
      ...Object.keys(DEFAULT_PRICING_CONFIG.models),
      ...Object.keys(pricing.models),
      ...discoveredModels.filter(Boolean),
    ]);

    for (const id of Array.from(allIds).sort()) {
      const existing =
        pricing.models[id] ??
        DEFAULT_PRICING_CONFIG.models[id] ??
        FALLBACK_MODEL_PRICE;
      merged[id] = { ...existing };
    }

    setModels(merged);
    setNewModelId('');
    setErrorMsg(null);
  }, [isOpen, pricing, discoveredModels]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) {
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, saving, onClose]);

  if (!isOpen) {
    return null;
  }

  const modelIds = Object.keys(models).sort();

  const handlePriceChange = (
    modelId: string,
    field: keyof ModelPrice,
    rawVal: string,
  ) => {
    const parsed = rawVal === '' ? 0 : Number(rawVal);
    setModels((prev) => ({
      ...prev,
      [modelId]: {
        ...prev[modelId],
        [field]: Number.isFinite(parsed) ? parsed : 0,
      },
    }));
  };

  const handleAddModel = () => {
    const trimmed = newModelId.trim();
    if (!trimmed) return;
    if (models[trimmed]) {
      setErrorMsg(`模型 "${trimmed}" 已在列表中`);
      return;
    }
    setModels((prev) => ({
      ...prev,
      [trimmed]: { ...FALLBACK_MODEL_PRICE },
    }));
    setNewModelId('');
    setErrorMsg(null);
  };

  const handleResetDefaults = () => {
    setCurrency(DEFAULT_PRICING_CONFIG.currency);
    setUsdToCnyRate(String(DEFAULT_PRICING_CONFIG.usdToCnyRate));
    const resetModels: Record<string, ModelPrice> = {};
    const allIds = new Set([
      ...Object.keys(DEFAULT_PRICING_CONFIG.models),
      ...discoveredModels.filter(Boolean),
    ]);
    for (const id of Array.from(allIds).sort()) {
      resetModels[id] = {
        ...(DEFAULT_PRICING_CONFIG.models[id] ?? FALLBACK_MODEL_PRICE),
      };
    }
    setModels(resetModels);
    setErrorMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const rate = Number(usdToCnyRate);
    if (!Number.isFinite(rate) || rate <= 0) {
      setErrorMsg('USD → CNY 汇率必须是大于 0 的有效数字');
      return;
    }

    for (const [id, price] of Object.entries(models)) {
      if (
        !Number.isFinite(price.inputPer1M) ||
        price.inputPer1M < 0 ||
        !Number.isFinite(price.cacheReadPer1M) ||
        price.cacheReadPer1M < 0 ||
        !Number.isFinite(price.outputPer1M) ||
        price.outputPer1M < 0
      ) {
        setErrorMsg(`模型 ${id} 的单价必须为大于或等于 0 的数字`);
        return;
      }
    }

    setSaving(true);
    try {
      await onSave({
        currency,
        usdToCnyRate: rate,
        models,
      });
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '保存单价配置失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/35 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pricing-modal-title"
    >
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-[0_24px_48px_rgba(15,23,42,0.16)]">
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2
              id="pricing-modal-title"
              className="text-base font-semibold text-gray-900"
            >
              Pricing & Currency Settings
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              配置展示币种、汇率与各模型单价（单位：USD / 1M Tokens），保存后立即持久化到本地
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close pricing settings"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 表单主体 */}
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {/* 币种与汇率 */}
            <div className="grid grid-cols-1 gap-4 rounded-2xl bg-[#F7F8FA] p-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-gray-600">
                  展示币种
                </label>
                <div className="mt-2 inline-flex rounded-full bg-gray-200/80 p-1 text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => setCurrency('CNY')}
                    className={`cursor-pointer rounded-full px-4 py-1.5 transition-all ${
                      currency === 'CNY'
                        ? 'bg-white text-gray-900 shadow-xs'
                        : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    CNY (¥)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrency('USD')}
                    className={`cursor-pointer rounded-full px-4 py-1.5 transition-all ${
                      currency === 'USD'
                        ? 'bg-white text-gray-900 shadow-xs'
                        : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    USD ($)
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="usd-to-cny-rate"
                  className="block text-xs font-medium text-gray-600"
                >
                  USD → CNY 汇率
                </label>
                <input
                  id="usd-to-cny-rate"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={usdToCnyRate}
                  onChange={(e) => setUsdToCnyRate(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm tabular-nums text-gray-900 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            {/* 模型单价表 */}
            <div>
              <div className="mb-2.5 flex items-center justify-between">
                <span className="text-xs font-medium text-gray-600">
                  模型单价表（USD / 1M Tokens）
                </span>
                <button
                  type="button"
                  onClick={handleResetDefaults}
                  className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>恢复默认参考价</span>
                </button>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-gray-200/80">
                <table className="w-full min-w-[560px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 bg-[#F9FAFB] text-gray-500">
                      <th className="py-2.5 pl-4 pr-2 font-medium">Model</th>
                      <th className="px-2 py-2.5 font-medium">Input ($/1M)</th>
                      <th className="px-2 py-2.5 font-medium">Cache Read ($/1M)</th>
                      <th className="py-2.5 pl-2 pr-4 font-medium">Output ($/1M)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {modelIds.map((id) => {
                      const p = models[id];
                      return (
                        <tr key={id} className="hover:bg-gray-50/60">
                          <td className="py-2.5 pl-4 pr-2">
                            <div className="font-medium text-gray-900">
                              {formatModelName(id)}
                            </div>
                            <div className="font-mono text-[11px] text-gray-400">
                              {id}
                            </div>
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="number"
                              step="0.0001"
                              min="0"
                              aria-label={`${id} input price`}
                              value={p.inputPer1M}
                              onChange={(e) =>
                                handlePriceChange(id, 'inputPer1M', e.target.value)
                              }
                              className="w-24 rounded-lg border border-gray-200 px-2.5 py-1.5 tabular-nums text-gray-900 focus:border-blue-500 focus:outline-none"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="number"
                              step="0.0001"
                              min="0"
                              aria-label={`${id} cache read price`}
                              value={p.cacheReadPer1M}
                              onChange={(e) =>
                                handlePriceChange(
                                  id,
                                  'cacheReadPer1M',
                                  e.target.value,
                                )
                              }
                              className="w-24 rounded-lg border border-gray-200 px-2.5 py-1.5 tabular-nums text-gray-900 focus:border-blue-500 focus:outline-none"
                            />
                          </td>
                          <td className="py-2 pl-2 pr-4">
                            <input
                              type="number"
                              step="0.0001"
                              min="0"
                              aria-label={`${id} output price`}
                              value={p.outputPer1M}
                              onChange={(e) =>
                                handlePriceChange(id, 'outputPer1M', e.target.value)
                              }
                              className="w-24 rounded-lg border border-gray-200 px-2.5 py-1.5 tabular-nums text-gray-900 focus:border-blue-500 focus:outline-none"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* 添加模型单价 */}
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="text"
                  placeholder="添加未列出的模型 ID（如 gemini-4-pro-high）"
                  value={newModelId}
                  onChange={(e) => setNewModelId(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddModel();
                    }
                  }}
                  className="flex-1 rounded-xl border border-gray-200 px-3 py-1.5 text-xs text-gray-800 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddModel}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>添加模型</span>
                </button>
              </div>
            </div>

            {errorMsg && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700">
                {errorMsg}
              </div>
            )}
          </div>

          {/* 底部操作栏 */}
          <div className="flex items-center justify-end gap-2.5 border-t border-gray-100 bg-[#FAFAFB] px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="cursor-pointer rounded-full border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="cursor-pointer rounded-full bg-[#111827] px-5 py-2 text-xs font-medium text-white transition-colors hover:bg-black disabled:opacity-50"
            >
              {saving ? '保存中...' : '保存配置'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
