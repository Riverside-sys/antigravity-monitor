import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  FolderCog,
  AlertTriangle,
  RotateCcw,
  X,
} from 'lucide-react';
import type { DataSourceConfig } from '../types';

interface DataDirModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: DataSourceConfig | null;
  onSave: (customDataRoot: string) => Promise<void>;
}

const SOURCE_LABELS: Record<DataSourceConfig['source'], string> = {
  config: 'Custom (UI)',
  env: 'ENV (ANTIGRAVITY_DATA_DIR)',
  default: 'Default (~/.gemini/antigravity)',
};

export function DataDirModal({
  isOpen,
  onClose,
  config,
  onSave,
}: DataDirModalProps) {
  const [inputPath, setInputPath] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setInputPath(config?.customDataRoot ?? '');
    setErrorMsg(null);
  }, [isOpen, config]);

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

  const handleSubmit = async (nextPath: string) => {
    setSaving(true);
    setErrorMsg(null);
    try {
      await onSave(nextPath);
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : '保存数据目录配置失败'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="data-dir-modal-title"
        className="w-full max-w-lg rounded-2xl border border-gray-100 bg-white shadow-[0_24px_48px_rgba(15,23,42,0.16)]"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-100 text-gray-700">
              <FolderCog className="h-4 w-4" />
            </div>
            <div>
              <h2
                id="data-dir-modal-title"
                className="text-base font-semibold text-gray-900"
              >
                Antigravity 数据目录
              </h2>
              <p className="text-xs text-gray-500">
                100% 本地只读，默认自动识别当前系统的 ~/.gemini/antigravity
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close modal"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-6 py-5">
          {/* 当前生效目录状态卡片 */}
          {config && (
            <div className="rounded-xl border border-gray-200/80 bg-[#F7F8FA] p-3.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-gray-500">当前生效目录</span>
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-gray-600 shadow-2xs">
                  {SOURCE_LABELS[config.source]}
                </span>
              </div>
              <div className="mt-1.5 break-all font-mono text-[12px] text-gray-900">
                {config.effectiveDataRoot}
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                {config.exists && config.hasBrainDir ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    <span className="text-emerald-700">
                      已检测到 brain 会话日志目录
                    </span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                    <span className="text-amber-700">
                      {config.exists
                        ? '目录存在，但未找到 brain 子目录'
                        : '该目录不存在，请在下方指定正确的 Antigravity 数据目录'}
                    </span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* 自定义目录输入 */}
          <div>
            <label
              htmlFor="custom-data-root-input"
              className="block text-xs font-medium text-gray-700"
            >
              自定义 Antigravity 数据目录（留空则使用环境变量或默认路径）
            </label>
            <input
              id="custom-data-root-input"
              type="text"
              value={inputPath}
              onChange={(e) => setInputPath(e.target.value)}
              placeholder={
                config?.defaultDataRoot || '~/.gemini/antigravity'
              }
              className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 font-mono text-xs text-gray-900 transition-colors focus:border-blue-500 focus:outline-none"
            />
            <p className="mt-1.5 text-[11px] leading-relaxed text-gray-400">
              支持 Windows / macOS / Linux 绝对路径及{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5 text-gray-600">
                ~
              </code>{' '}
              缩写；也可在启动前通过环境变量{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5 text-gray-600">
                ANTIGRAVITY_DATA_DIR
              </code>{' '}
              指定。配置仅保存在本地{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5 text-gray-600">
                data/config.json
              </code>
              。
            </p>
          </div>

          {errorMsg && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700">
              {errorMsg}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4">
          <button
            type="button"
            onClick={() => void handleSubmit('')}
            disabled={saving || !config?.customDataRoot}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>恢复默认</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="cursor-pointer rounded-full px-4 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit(inputPath)}
              disabled={saving}
              className="cursor-pointer rounded-full bg-[#111827] px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-black disabled:opacity-50"
            >
              {saving ? '保存中...' : '保存并重新扫描'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
