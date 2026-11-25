import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BookmarkPlus,
  Bot,
  Check,
  Copy,
  CopyPlus,
  Download,
  Eye,
  EyeOff,
  FileText,
  Layers,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Terminal,
  Trash2,
  Upload,
  Wand2,
  Workflow,
} from 'lucide-react';
import { FileDropzone } from './FileDropzone.tsx';
import { ALL_TOOLS, getTool } from '../core/registry.ts';
import { runPipeline } from '../core/pipeline.ts';
import { formatByteSize } from '../core/types.ts';
import type {
  PipelineExecutionResult,
  PipelineStep,
  ToolParameterProperty,
  VirtualFile,
} from '../core/types.ts';
import {
  checkPipelineStepCompatibility,
  resolveIntentFromPrompt,
} from '../utils/aiIntentParser.ts';
import {
  downloadVirtualFile,
  downloadVirtualFiles,
  filesToVirtualFiles,
  virtualFileToBlobUrl,
} from '../utils/virtualFileWeb.ts';

interface EditableStep {
  uid: string;
  tool: string;
  params: Record<string, unknown>;
  enabled: boolean;
}

interface WorkflowPreset {
  id: string;
  title: string;
  desc: string;
  steps: PipelineStep[];
}

const WORKFLOW_PRESETS: WorkflowPreset[] = [
  {
    id: 'scan-to-pdf',
    title: 'Foto Dokumen -> PDF Rapi',
    desc: 'Resize 1400px -> Kompres JPEG -> Gabung ke PDF A4 -> Watermark -> Nomor Halaman',
    steps: [
      { tool: 'image.resize', params: { width: 1400, fit: 'inside' } },
      { tool: 'image.compress', params: { quality: 82, format: 'jpeg' } },
      { tool: 'pdf.from_images', params: { pageSize: 'A4', margin: 20, outputName: 'dokumen_rapi.pdf' } },
      { tool: 'pdf.watermark', params: { text: 'INTERNAL', opacity: 0.2, position: 'center-diagonal' } },
      { tool: 'pdf.page_numbers', params: { position: 'bottom-center', format: 'page-of-total' } },
    ],
  },
  {
    id: 'md-qr-pdf',
    title: 'Markdown + QR Stamp -> PDF',
    desc: 'Buat PDF dari Markdown -> Buat QR Code -> Tempel QR di pojok PDF -> Nomor Halaman',
    steps: [
      {
        tool: 'util.md_to_pdf',
        params: {
          markdown: '# Dokumen Terverifikasi\n\nDokumen ini dibuat dan distempel otomatis oleh WorkTools Visual Pipeline.\n\n## Status\n- Terverifikasi QR\n- Siap Distribusi',
          title: 'Dokumen Verifikasi',
          pageSize: 'A4',
          outputName: 'verified_doc.pdf',
        },
      },
      { tool: 'util.qr_generate', params: { text: 'https://worktools.my.id', size: 240 } },
      { tool: 'pdf.stamp_image', params: { position: 'bottom-right', width: 80, margin: 24 } },
      { tool: 'pdf.page_numbers', params: { position: 'bottom-left', format: 'n-of-total' } },
    ],
  },
  {
    id: 'redact-watermark-compress',
    title: 'Kontrak Aman (PII + Cap + Kompres)',
    desc: 'Sensor NIK/Email/HP permanen -> Watermark RAHASIA -> Kompres PDF',
    steps: [
      { tool: 'pdf.redact_text', params: { presetPattern: 'all_pii', burnIn: true, label: 'REDACTED' } },
      { tool: 'pdf.watermark', params: { text: 'RAHASIA', opacity: 0.2, position: 'center-diagonal' } },
      { tool: 'pdf.compress', params: { quality: 'medium' } },
    ],
  },
  {
    id: 'scan-ktp-grid-pdf',
    title: 'Scan KTP / Dokumen -> Grid A4 PDF',
    desc: 'Putihkan latar scan -> Susun Grid 2x2 A4 -> Konversi ke PDF siap cetak',
    steps: [
      { tool: 'image.scan_enhance', params: { mode: 'whiten-bg', contrast: 45, threshold: 175 } },
      { tool: 'image.grid_sheet', params: { columns: 2, rows: 2, pageSize: 'A4' } },
      { tool: 'pdf.from_images', params: { pageSize: 'A4', margin: 16, outputName: 'lembar_cetak_a4.pdf' } },
    ],
  },
  {
    id: 'pdf-to-compressed-jpg',
    title: 'PDF -> Gambar Kompres -> ZIP',
    desc: 'Render halaman PDF ke JPG -> Kompres ukuran -> Kemas ke arsip ZIP',
    steps: [
      { tool: 'pdf.to_images', params: { format: 'jpeg', scale: 2, quality: 90 } },
      { tool: 'image.compress', params: { quality: 75, format: 'jpeg', maxWidth: 1600 } },
      { tool: 'util.zip_pack', params: { archiveName: 'halaman_pdf.zip' } },
    ],
  },
  {
    id: 'pas-foto-clean',
    title: 'Pas Foto 3:4 & Privasi EXIF',
    desc: 'Crop rasio 3:4 -> Hapus EXIF/GPS -> Kemas ke ZIP',
    steps: [
      { tool: 'image.crop', params: { aspectRatio: '3:4' } },
      { tool: 'image.strip_metadata', params: {} },
      { tool: 'util.zip_pack', params: { archiveName: 'pas_foto_bersih.zip' } },
    ],
  },
];

const CUSTOM_PRESETS_KEY = 'tenggoo_custom_pipelines_v1';

function loadSavedPresets(): WorkflowPreset[] {
  try {
    const raw = window.localStorage.getItem(CUSTOM_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WorkflowPreset[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildDefaultParams(toolId: string): Record<string, unknown> {
  const def = getTool(toolId);
  if (!def) return {};
  const defaults: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries(def.parameterSchema.properties)) {
    if (prop.default !== undefined) {
      defaults[key] = prop.default;
    }
  }
  return defaults;
}

function makeStep(
  toolId: string,
  overrideParams?: Record<string, unknown>,
  enabled = true,
): EditableStep {
  return {
    uid: `step-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    tool: toolId,
    params: { ...buildDefaultParams(toolId), ...(overrideParams ?? {}) },
    enabled,
  };
}

function formatMimeList(mimes: string[]): string {
  if (mimes.includes('*/*')) return 'Semua File';
  const tags = new Set<string>();
  for (const m of mimes) {
    if (m === 'application/pdf') tags.add('PDF');
    else if (m.startsWith('image/')) tags.add('Gambar');
    else if (m.includes('zip')) tags.add('ZIP');
    else if (m === 'application/json') tags.add('JSON');
    else if (m.startsWith('text/')) tags.add('Teks');
  }
  return Array.from(tags).join('/') || 'File';
}

function formatParamValueForCli(v: unknown): string {
  if (typeof v === 'object' && v !== null) return JSON.stringify(v);
  return String(v);
}

function isTextFile(file: VirtualFile): boolean {
  return (
    file.mimeType.startsWith('text/') ||
    file.mimeType === 'application/json' ||
    /\.(md|txt|csv|json)$/i.test(file.name)
  );
}

interface PipelineStudioProps {
  initialInputFiles?: VirtualFile[];
  initialSteps?: PipelineStep[];
}

export const PipelineStudio: React.FC<PipelineStudioProps> = ({
  initialInputFiles,
  initialSteps,
}) => {
  const [inputs, setInputs] = useState<VirtualFile[]>(() => initialInputFiles ?? []);
  const [steps, setSteps] = useState<EditableStep[]>(() =>
    initialSteps && initialSteps.length > 0
      ? initialSteps.map((s) => makeStep(s.tool, s.params))
      : WORKFLOW_PRESETS[1].steps.map((s) => makeStep(s.tool, s.params)),
  );

  const [builderPrompt, setBuilderPrompt] = useState('');
  const [builderNotice, setBuilderNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const [isRunning, setIsRunning] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PipelineExecutionResult | null>(null);
  const [selectedPreviewIdx, setSelectedPreviewIdx] = useState(0);
  const [cliFormat, setCliFormat] = useState<'steps-flags' | 'json'>('steps-flags');
  const [copiedMode, setCopiedMode] = useState<'cli' | 'mcp' | 'preview-text' | null>(null);
  const [savedPresets, setSavedPresets] = useState<WorkflowPreset[]>(() => loadSavedPresets());
  const [newPresetName, setNewPresetName] = useState('');

  const cleanSteps = useMemo<PipelineStep[]>(
    () =>
      steps
        .filter((s) => s.enabled)
        .map((s) => ({
          tool: s.tool,
          params: s.params,
        })),
    [steps],
  );

  const activeStepPrevToolMap = useMemo(() => {
    const map = new Map<string, string | undefined>();
    let prevEnabledTool: string | undefined = undefined;
    for (const st of steps) {
      if (!st.enabled) continue;
      map.set(st.uid, prevEnabledTool);
      prevEnabledTool = st.tool;
    }
    return map;
  }, [steps]);

  const cliCommand = useMemo(() => {
    const inputArg =
      inputs.length > 0 ? `-i ${inputs.map((f) => `"${f.name}"`).join(' ')} ` : '';
    if (cliFormat === 'steps-flags') {
      const stepFlags = cleanSteps
        .map((st) => {
          const pairs = Object.entries(st.params ?? {})
            .filter(([, val]) => val !== undefined && val !== '')
            .map(([k, val]) => `${k}=${formatParamValueForCli(val)}`);
          return pairs.length > 0
            ? `--step "${st.tool}:${pairs.join(',')}"`
            : `--step "${st.tool}"`;
        })
        .join(' \\\n  ');
      return `node bin/tenggoo.mjs pipeline ${inputArg}\\\n  ${stepFlags || '--step "pdf.merge"'} \\\n  -o ./output --json`;
    }
    const stepsJson = JSON.stringify(cleanSteps);
    return `node bin/tenggoo.mjs pipeline ${inputArg}-o ./output --steps '${stepsJson}' --json`;
  }, [inputs, cleanSteps, cliFormat]);

  const mcpCallPayload = useMemo(
    () =>
      JSON.stringify(
        {
          tool: 'tenggoo_pipeline_run',
          arguments: {
            input_paths: inputs.map((f) => f.name),
            output_path: './output',
            steps: cleanSteps,
          },
        },
        null,
        2,
      ),
    [inputs, cleanSteps],
  );

  const selectedOutputFile = result?.files[selectedPreviewIdx] ?? result?.files[0] ?? null;

  const previewFileUrl = useMemo(() => {
    if (!selectedOutputFile) return null;
    if (
      selectedOutputFile.mimeType === 'application/pdf' ||
      selectedOutputFile.mimeType.startsWith('image/')
    ) {
      return virtualFileToBlobUrl(selectedOutputFile);
    }
    return null;
  }, [selectedOutputFile]);

  const previewTextContent = useMemo(() => {
    if (!selectedOutputFile || !isTextFile(selectedOutputFile)) return null;
    return new TextDecoder().decode(selectedOutputFile.bytes);
  }, [selectedOutputFile]);

  useEffect(() => {
    return () => {
      if (previewFileUrl) URL.revokeObjectURL(previewFileUrl);
    };
  }, [previewFileUrl]);

  const handleFilesDrop = async (files: File[]) => {
    const vFiles = await filesToVirtualFiles(files);
    setInputs((prev) => [...prev, ...vFiles]);
    setError(null);
  };

  const handleGenerateFromPrompt = () => {
    const resolved = resolveIntentFromPrompt(builderPrompt, inputs);
    if (!resolved || resolved.steps.length === 0) {
      setBuilderNotice({
        ok: false,
        text: 'Belum mengenali langkah dari instruksi tersebut. Coba kata kunci seperti "gabung pdf", "sensor nik", "watermark \'RAHASIA\'", "kompres", atau "pack zip".',
      });
      return;
    }
    setSteps(resolved.steps.map((s) => makeStep(s.tool, s.params)));
    setResult(null);
    setError(null);
    setBuilderNotice({
      ok: true,
      text: `Terbentuk ${resolved.steps.length} langkah: ${resolved.explanation}`,
    });
  };

  const applyPreset = (preset: WorkflowPreset) => {
    setSteps(preset.steps.map((s) => makeStep(s.tool, s.params)));
    setResult(null);
    setError(null);
    setBuilderNotice(null);
  };

  const persistPresets = (next: WorkflowPreset[]) => {
    setSavedPresets(next);
    try {
      window.localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage quota errors
    }
  };

  const handleSaveCustomPreset = () => {
    const title = newPresetName.trim();
    if (!title || cleanSteps.length === 0) return;
    const newPreset: WorkflowPreset = {
      id: `custom-${Date.now()}`,
      title,
      desc: cleanSteps.map((s) => s.tool).join(' -> '),
      steps: cleanSteps,
    };
    persistPresets([newPreset, ...savedPresets]);
    setNewPresetName('');
  };

  const handleDeleteCustomPreset = (id: string) => {
    persistPresets(savedPresets.filter((p) => p.id !== id));
  };

  const handleExportPipelineJson = () => {
    const json = JSON.stringify(
      { name: newPresetName.trim() || 'worktool-pipeline', steps: cleanSteps },
      null,
      2,
    );
    downloadVirtualFile({
      name: `${(newPresetName.trim() || 'worktool-pipeline').replace(/\s+/g, '_')}.pipeline.json`,
      mimeType: 'application/json',
      bytes: new TextEncoder().encode(json),
    });
  };

  const handleImportPipelineJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { steps?: PipelineStep[] } | PipelineStep[];
      const importedSteps = Array.isArray(parsed) ? parsed : parsed.steps;
      if (!Array.isArray(importedSteps) || importedSteps.length === 0) {
        throw new Error('Format .pipeline.json tidak valid.');
      }
      setSteps(importedSteps.map((s) => makeStep(s.tool, s.params)));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      e.target.value = '';
    }
  };

  const updateStepTool = (uid: string, newToolId: string) => {
    setSteps((prev) =>
      prev.map((step) =>
        step.uid === uid
          ? { ...step, tool: newToolId, params: buildDefaultParams(newToolId) }
          : step,
      ),
    );
  };

  const updateStepParam = (uid: string, key: string, value: unknown) => {
    setSteps((prev) =>
      prev.map((step) =>
        step.uid === uid
          ? { ...step, params: { ...step.params, [key]: value } }
          : step,
      ),
    );
  };

  const toggleStepEnabled = (uid: string) => {
    setSteps((prev) =>
      prev.map((step) => (step.uid === uid ? { ...step, enabled: !step.enabled } : step)),
    );
  };

  const duplicateStep = (index: number) => {
    setSteps((prev) => {
      const target = prev[index];
      if (!target) return prev;
      const cloned = makeStep(target.tool, { ...target.params }, target.enabled);
      const next = [...prev];
      next.splice(index + 1, 0, cloned);
      return next;
    });
  };

  const resetStepParams = (uid: string) => {
    setSteps((prev) =>
      prev.map((step) =>
        step.uid === uid ? { ...step, params: buildDefaultParams(step.tool) } : step,
      ),
    );
  };

  const moveStep = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= steps.length) return;
    setSteps((prev) => {
      const copy = [...prev];
      const item = copy[index];
      copy[index] = copy[target];
      copy[target] = item;
      return copy;
    });
  };

  const handleRunPipeline = async () => {
    if (cleanSteps.length === 0) {
      setError('Aktifkan minimal 1 langkah pipeline terlebih dahulu.');
      return;
    }
    setIsRunning(true);
    setError(null);
    setResult(null);
    setSelectedPreviewIdx(0);

    try {
      const execResult = await runPipeline(inputs, cleanSteps, (stepIdx, total, toolId, pct) => {
        setProgressText(`Langkah ${stepIdx + 1}/${total} (${toolId}) · ${pct}%`);
      });
      setResult(execResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRunning(false);
      setProgressText('');
    }
  };

  const renderParamInput = (
    step: EditableStep,
    key: string,
    prop: ToolParameterProperty,
  ) => {
    const val = step.params[key];

    if (prop.enum && prop.enum.length > 0) {
      return (
        <select
          value={String(val ?? prop.default ?? prop.enum[0])}
          onChange={(e) => {
            const raw = e.target.value;
            const parsed = prop.type === 'integer' || prop.type === 'number' ? Number(raw) : raw;
            updateStepParam(step.uid, key, parsed);
          }}
          className="w-full px-2.5 py-1.5 rounded-xl border border-black/[0.1] bg-white text-xs text-[#1D1D1F]"
        >
          {prop.enum.map((opt) => (
            <option key={String(opt)} value={String(opt)}>
              {String(opt)}
            </option>
          ))}
        </select>
      );
    }

    if (prop.type === 'boolean') {
      return (
        <label className="inline-flex items-center gap-2 text-xs text-[#1D1D1F] cursor-pointer py-1">
          <input
            type="checkbox"
            checked={Boolean(val)}
            onChange={(e) => updateStepParam(step.uid, key, e.target.checked)}
            className="accent-[#0071E3] w-4 h-4"
          />
          <span>Aktif</span>
        </label>
      );
    }

    if (prop.type === 'number' || prop.type === 'integer') {
      return (
        <input
          type="number"
          value={val === undefined ? '' : Number(val)}
          min={prop.minimum}
          max={prop.maximum}
          step={prop.type === 'number' ? 'any' : 1}
          placeholder={prop.default !== undefined ? String(prop.default) : ''}
          onChange={(e) => {
            const raw = e.target.value;
            updateStepParam(step.uid, key, raw === '' ? undefined : Number(raw));
          }}
          className="w-full px-2.5 py-1.5 rounded-xl border border-black/[0.1] bg-white text-xs text-[#1D1D1F]"
        />
      );
    }

    if (prop.type === 'array') {
      const strVal = Array.isArray(val) ? val.join(', ') : String(val ?? '');
      return (
        <input
          type="text"
          value={strVal}
          placeholder="Contoh: 2, 1, 3"
          onChange={(e) => {
            const items = e.target.value
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
              .map((s) => (prop.items?.type === 'integer' || prop.items?.type === 'number' ? Number(s) : s));
            updateStepParam(step.uid, key, items);
          }}
          className="w-full px-2.5 py-1.5 rounded-xl border border-black/[0.1] bg-white text-xs text-[#1D1D1F]"
        />
      );
    }

    if (key === 'markdown' || key === 'data' || prop.type === 'object') {
      const strValue =
        prop.type === 'object' && typeof val === 'object' && val !== null
          ? JSON.stringify(val)
          : String(val ?? '');
      return (
        <textarea
          rows={3}
          value={strValue}
          onChange={(e) => {
            if (prop.type === 'object') {
              try {
                updateStepParam(step.uid, key, JSON.parse(e.target.value));
              } catch {
                updateStepParam(step.uid, key, e.target.value);
              }
            } else {
              updateStepParam(step.uid, key, e.target.value);
            }
          }}
          className="w-full px-2.5 py-1.5 rounded-xl border border-black/[0.1] bg-white text-xs font-mono text-[#1D1D1F]"
        />
      );
    }

    return (
      <input
        type="text"
        value={String(val ?? '')}
        placeholder={prop.default !== undefined ? String(prop.default) : prop.description}
        onChange={(e) => updateStepParam(step.uid, key, e.target.value)}
        className="w-full px-2.5 py-1.5 rounded-xl border border-black/[0.1] bg-white text-xs text-[#1D1D1F]"
      />
    );
  };

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col gap-5">
      {/* Header Banner */}
      <div className="bg-white rounded-[24px] p-5 sm:p-6 border border-black/[0.05] shadow-[0_2px_16px_rgba(0,0,0,0.03)] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-11 h-11 rounded-[16px] bg-[#1D1D1F] text-white flex items-center justify-center shrink-0">
            <Workflow size={21} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-semibold text-[#1D1D1F] tracking-[-0.02em]">
                Visual Pipeline Studio
              </h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#0071E3]/10 text-[#0071E3] text-[11px] font-semibold">
                <Bot size={12} /> {ALL_TOOLS.length} Tools
              </span>
            </div>
            <p className="text-xs sm:text-sm text-[#6E6E73] mt-0.5 max-w-2xl">
              Susun alur pemrosesan PDF, Gambar, &amp; Arsip berantai secara visual — otomatis menghasilkan perintah CLI &amp; payload MCP siap pakai.
            </p>
          </div>
        </div>
      </div>

      {/* Natural Language AI Pipeline Builder */}
      <div className="bg-[#0B0B0E] text-white rounded-[24px] p-5 sm:p-6 shadow-md space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-xl bg-white/10 text-[#4CC9F0] flex items-center justify-center">
              <Wand2 size={14} />
            </span>
            <div>
              <h2 className="text-sm font-semibold tracking-tight">
                AI Pipeline Builder (Susun Otomatis dari Bahasa Alami)
              </h2>
              <p className="text-[11px] text-[#A1A1A6]">
                Ketik tugas multi-langkah — mesin lokal langsung menyusun rangkaian blok di bawah ini.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              "Gabung PDF, sensor NIK, beri watermark 'RAHASIA', kompres kuat",
              'Rapikan scan, susun grid A4, jadikan PDF',
              'PDF ke gambar JPG lalu bungkus ke paket.zip',
            ].map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setBuilderPrompt(example)}
                className="px-2.5 py-1 rounded-full bg-white/[0.08] hover:bg-white/[0.15] text-[10px] text-[#E5E5EA] transition-colors truncate max-w-[230px]"
                title={example}
              >
                {example}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={builderPrompt}
            onChange={(e) => setBuilderPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleGenerateFromPrompt();
              }
            }}
            placeholder="Contoh: Gabungkan PDF, tambahkan nomor halaman di kanan bawah, lalu kompres kuat..."
            className="flex-1 px-4 py-2.5 rounded-full bg-white/[0.08] border border-white/[0.14] focus:border-[#4CC9F0] outline-none text-xs sm:text-sm text-white placeholder:text-[#86868B]"
          />
          <button
            type="button"
            onClick={handleGenerateFromPrompt}
            disabled={!builderPrompt.trim()}
            className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-full bg-[#0071E3] hover:bg-[#0077ED] disabled:opacity-40 text-white text-xs sm:text-sm font-semibold transition-colors shrink-0"
          >
            <Sparkles size={14} />
            <span>Buat Rangkaian</span>
          </button>
        </div>

        {builderNotice && (
          <p
            className={`text-xs font-medium ${
              builderNotice.ok ? 'text-[#34C759]' : 'text-amber-300'
            }`}
          >
            {builderNotice.text}
          </p>
        )}
      </div>

      {/* Presets & Saved Custom Workflows */}
      <div className="bg-white rounded-[24px] p-5 sm:p-6 shadow-[0_2px_16px_rgba(0,0,0,0.03)] border border-black/[0.05] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#6E6E73]">
            <Sparkles size={14} className="text-[#0071E3]" />
            <span>Preset Kombinasi Cepat &amp; Resep Tersimpan</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportPipelineJson}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-black/[0.08] bg-[#F5F5F7] hover:bg-black/[0.06] text-xs font-medium text-[#1D1D1F] transition-colors"
            >
              <Download size={12} /> Export .json
            </button>
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-black/[0.08] bg-[#F5F5F7] hover:bg-black/[0.06] text-xs font-medium text-[#1D1D1F] cursor-pointer transition-colors">
              <Upload size={12} /> Import .json
              <input type="file" accept=".json" className="hidden" onChange={handleImportPipelineJson} />
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {WORKFLOW_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyPreset(preset)}
              className="p-3.5 rounded-[18px] border border-black/[0.06] bg-[#F5F5F7]/65 hover:bg-[#0071E3]/[0.06] hover:border-[#0071E3]/40 text-left transition-all"
            >
              <div className="text-xs font-semibold text-[#1D1D1F]">{preset.title}</div>
              <div className="text-[11px] text-[#6E6E73] mt-1 leading-snug">{preset.desc}</div>
            </button>
          ))}
        </div>

        <div className="pt-3 border-t border-black/[0.06] space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              placeholder="Simpan susunan saat ini sebagai preset (misal: Kontrak Klien + QR)"
              className="flex-1 min-w-[200px] px-3.5 py-2 rounded-full border border-black/[0.1] text-xs bg-white text-[#1D1D1F]"
            />
            <button
              type="button"
              onClick={handleSaveCustomPreset}
              disabled={!newPresetName.trim() || cleanSteps.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#1D1D1F] hover:bg-black text-white text-xs font-semibold disabled:opacity-40 transition-colors"
            >
              <BookmarkPlus size={14} /> Simpan Preset
            </button>
          </div>

          {savedPresets.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {savedPresets.map((preset) => (
                <div
                  key={preset.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0071E3]/10 border border-[#0071E3]/20 text-xs"
                >
                  <button
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className="font-semibold text-[#0071E3] hover:underline"
                    title={preset.desc}
                  >
                    {preset.title}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteCustomPreset(preset.id)}
                    className="text-[#0071E3]/60 hover:text-rose-600"
                    title="Hapus preset"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Input Files */}
      <div className="bg-white rounded-[24px] p-5 sm:p-6 shadow-[0_2px_16px_rgba(0,0,0,0.03)] border border-black/[0.05] space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#1D1D1F]">
            1. File Input Awal (Opsional jika langkah awal generator)
          </h3>
          {inputs.length > 0 && (
            <button
              type="button"
              onClick={() => setInputs([])}
              className="text-xs font-semibold text-rose-600 hover:underline"
            >
              Kosongkan Input
            </button>
          )}
        </div>
        <FileDropzone
          onFilesDrop={handleFilesDrop}
          multiple={true}
          accept="*"
          label="Drop file PDF, Gambar, Markdown, CSV/JSON, atau ZIP sebagai bahan awal pipeline"
          helpText="Output dari setiap langkah otomatis diteruskan ke langkah berikutnya"
        />
        {inputs.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {inputs.map((f, idx) => (
              <div
                key={`${f.name}-${idx}`}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#F5F5F7] border border-black/[0.06] text-xs"
              >
                <FileText size={13} className="text-[#0071E3]" />
                <span className="font-semibold text-[#1D1D1F]">{f.name}</span>
                <span className="text-[#6E6E73]">({formatByteSize(f.bytes.byteLength)})</span>
                <button
                  type="button"
                  onClick={() => setInputs((prev) => prev.filter((_, i) => i !== idx))}
                  className="text-[#86868B] hover:text-rose-600"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pipeline Steps */}
      <div className="bg-white rounded-[24px] p-5 sm:p-6 shadow-[0_2px_16px_rgba(0,0,0,0.03)] border border-black/[0.05] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers size={18} className="text-[#0071E3]" />
            <h3 className="text-sm font-semibold text-[#1D1D1F]">
              2. Rangkaian Langkah ({cleanSteps.length} aktif dari {steps.length} langkah)
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => applyPreset(WORKFLOW_PRESETS[0])}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-black/[0.08] bg-[#F5F5F7] hover:bg-black/[0.06] text-xs font-medium text-[#1D1D1F] transition-colors"
              title="Kembalikan rangkaian ke preset default"
            >
              <RotateCcw size={12} /> Reset
            </button>
            <button
              type="button"
              onClick={() => setSteps((prev) => [...prev, makeStep('pdf.watermark')])}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-semibold transition-colors"
            >
              <Plus size={14} /> Tambah Langkah
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {steps.map((step, idx) => {
            const def = getTool(step.tool);
            const paramEntries = def ? Object.entries(def.parameterSchema.properties) : [];
            const prevToolId = step.enabled ? activeStepPrevToolMap.get(step.uid) : undefined;
            const compat = step.enabled
              ? checkPipelineStepCompatibility(prevToolId, step.tool)
              : { compatible: true };

            return (
              <div
                key={step.uid}
                className={`p-4 rounded-[18px] border space-y-3 transition-all ${
                  step.enabled
                    ? 'bg-[#F5F5F7]/70 border-black/[0.07]'
                    : 'bg-[#F5F5F7]/30 border-dashed border-black/[0.12] opacity-60'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-[220px]">
                    <span
                      className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${
                        step.enabled ? 'bg-[#1D1D1F] text-white' : 'bg-black/15 text-[#6E6E73]'
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <select
                      value={step.tool}
                      onChange={(e) => updateStepTool(step.uid, e.target.value)}
                      className="flex-1 px-3 py-1.5 rounded-xl border border-black/[0.1] bg-white text-xs font-semibold text-[#1D1D1F]"
                    >
                      <optgroup label="PDF Tools">
                        {ALL_TOOLS.filter((t) => t.category === 'pdf').map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.id} — {t.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Image Tools">
                        {ALL_TOOLS.filter((t) => t.category === 'image').map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.id} — {t.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Utility & Document Tools">
                        {ALL_TOOLS.filter((t) => t.category === 'utility').map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.id} — {t.name}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>

                  <div className="flex items-center gap-1 flex-wrap">
                    <button
                      type="button"
                      onClick={() => toggleStepEnabled(step.uid)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors ${
                        step.enabled
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                          : 'bg-white border-black/[0.1] text-[#6E6E73] hover:bg-black/[0.04]'
                      }`}
                      title={step.enabled ? 'Lewati langkah ini sementara' : 'Aktifkan langkah ini'}
                    >
                      {step.enabled ? <Eye size={12} /> : <EyeOff size={12} />}
                      <span>{step.enabled ? 'Aktif' : 'Dilewati'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => duplicateStep(idx)}
                      className="p-1.5 rounded-lg border border-black/[0.08] bg-white hover:bg-black/[0.04] text-[#424245]"
                      title="Duplikat langkah"
                    >
                      <CopyPlus size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => resetStepParams(step.uid)}
                      className="p-1.5 rounded-lg border border-black/[0.08] bg-white hover:bg-black/[0.04] text-[#424245]"
                      title="Reset parameter langkah ke default"
                    >
                      <RotateCcw size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveStep(idx, -1)}
                      disabled={idx === 0}
                      className="p-1.5 rounded-lg border border-black/[0.08] bg-white hover:bg-black/[0.04] disabled:opacity-40"
                      title="Naikkan"
                    >
                      <ArrowUp size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveStep(idx, 1)}
                      disabled={idx === steps.length - 1}
                      className="p-1.5 rounded-lg border border-black/[0.08] bg-white hover:bg-black/[0.04] disabled:opacity-40"
                      title="Turunkan"
                    >
                      <ArrowDown size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setSteps((prev) => prev.filter((s) => s.uid !== step.uid))}
                      disabled={steps.length <= 1}
                      className="p-1.5 rounded-lg border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 disabled:opacity-40"
                      title="Hapus langkah"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {def && (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#6E6E73]">
                    <span>{def.description}</span>
                    <span className="px-2 py-0.5 rounded-full bg-white border border-black/[0.06] text-[10px] font-medium text-[#424245] shrink-0">
                      {def.minInputs === 0
                        ? `Generator -> ${formatMimeList(def.producesMimeTypes)}`
                        : `${formatMimeList(def.acceptsMimeTypes)} -> ${formatMimeList(def.producesMimeTypes)}`}
                    </span>
                  </div>
                )}

                {!compat.compatible && compat.warning && (
                  <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900">
                    <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                    <span>{compat.warning}</span>
                  </div>
                )}

                {step.enabled && paramEntries.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
                    {paramEntries.map(([paramKey, prop]) => (
                      <div
                        key={paramKey}
                        className={paramKey === 'markdown' || paramKey === 'data' ? 'sm:col-span-2 lg:col-span-3' : ''}
                      >
                        <label
                          className="block text-[11px] font-semibold text-[#424245] mb-1"
                          title={prop.description}
                        >
                          {paramKey}
                        </label>
                        {renderParamInput(step, paramKey, prop)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {error && (
          <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-sm text-rose-700 font-medium">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleRunPipeline}
          disabled={isRunning || cleanSteps.length === 0}
          className="w-full flex items-center justify-center gap-2 bg-[#0071E3] hover:bg-[#0077ED] text-white py-3.5 px-6 rounded-full font-semibold shadow-sm disabled:opacity-50 transition-colors"
        >
          <Play size={17} />
          <span>
            {isRunning
              ? progressText || 'Menjalankan Pipeline...'
              : `Jalankan ${cleanSteps.length} Langkah Pipeline`}
          </span>
        </button>
      </div>

      {/* Pipeline Results */}
      {result && (
        <div className="bg-white rounded-[24px] p-6 shadow-[0_2px_16px_rgba(0,0,0,0.03)] border border-emerald-200 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-emerald-800">
                Pipeline Selesai dalam {result.totalDurationMs} ms
              </h3>
              <p className="text-xs text-[#6E6E73]">
                Menghasilkan {result.files.length} file akhir di perangkat Anda
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setInputs(result.files);
                  setResult(null);
                  setError(null);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-[#0071E3]/30 bg-[#0071E3]/10 hover:bg-[#0071E3]/15 text-[#0071E3] text-xs font-semibold transition-colors"
              >
                <Layers size={14} />
                <span>Jadikan Hasil sebagai Input Baru</span>
              </button>
              <button
                type="button"
                onClick={() => downloadVirtualFiles(result.files, 'pipeline_output.zip')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-colors"
              >
                <Download size={14} />
                <span>
                  {result.files.length > 1 ? 'Unduh Semua (ZIP)' : `Unduh ${result.files[0]?.name}`}
                </span>
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            {result.steps.map((st) => (
              <div
                key={st.stepIndex}
                className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-100"
              >
                <span className="font-medium text-[#1D1D1F]">
                  [{st.stepIndex}] <code className="text-[#0071E3] font-semibold">{st.tool}</code> —{' '}
                  {st.summary}
                </span>
                <span className="text-[#6E6E73] shrink-0 ml-2">{st.durationMs}ms</span>
              </div>
            ))}
          </div>

          {/* File Selector Tabs + Download Chips */}
          <div className="flex flex-wrap gap-2">
            {result.files.map((f, idx) => {
              const selected = idx === selectedPreviewIdx;
              return (
                <div
                  key={`${f.name}-${idx}`}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-colors ${
                    selected
                      ? 'bg-[#1D1D1F] text-white border-[#1D1D1F]'
                      : 'bg-[#F5F5F7] text-[#1D1D1F] border-black/[0.06] hover:bg-black/[0.06]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedPreviewIdx(idx)}
                    className="font-semibold flex items-center gap-1.5"
                    title="Pilih untuk pratinjau"
                  >
                    <Eye size={12} />
                    <span>
                      {f.name} ({formatByteSize(f.bytes.byteLength)})
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadVirtualFile(f)}
                    className={`p-1 rounded-full ${
                      selected ? 'hover:bg-white/20' : 'hover:bg-black/10'
                    }`}
                    title={`Unduh ${f.name}`}
                  >
                    <Download size={12} />
                  </button>
                </div>
              );
            })}
          </div>

          {previewFileUrl && selectedOutputFile?.mimeType === 'application/pdf' && (
            <iframe
              src={previewFileUrl}
              title={`Pipeline PDF Output: ${selectedOutputFile.name}`}
              className="w-full h-[55vh] min-h-[380px] rounded-2xl border border-black/[0.08] bg-white"
            />
          )}

          {previewFileUrl && selectedOutputFile?.mimeType.startsWith('image/') && (
            <div className="flex justify-center p-4 rounded-2xl bg-[#F5F5F7] border border-black/[0.06]">
              <img
                src={previewFileUrl}
                alt={`Pipeline Image Output: ${selectedOutputFile.name}`}
                className="max-h-80 object-contain rounded-xl"
              />
            </div>
          )}

          {previewTextContent !== null && selectedOutputFile && (
            <div className="rounded-2xl bg-[#0B0B0E] text-slate-100 p-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-[#A1A1A6]">
                <span className="font-mono">Pratinjau Output: {selectedOutputFile.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(previewTextContent);
                    setCopiedMode('preview-text');
                    window.setTimeout(() => setCopiedMode(null), 1800);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-white font-medium"
                >
                  {copiedMode === 'preview-text' ? (
                    <Check size={12} className="text-emerald-400" />
                  ) : (
                    <Copy size={12} />
                  )}
                  <span>{copiedMode === 'preview-text' ? 'Tersalin' : 'Salin Teks'}</span>
                </button>
              </div>
              <pre className="text-xs font-mono whitespace-pre-wrap break-words max-h-72 overflow-y-auto text-emerald-300">
                {previewTextContent}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* AI Agent Direct Integration Guide */}
      <div className="bg-[#0B0B0E] text-slate-100 rounded-[24px] p-6 shadow-md space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#4CC9F0]">
            <Terminal size={18} />
            <span>Integrasi Langsung untuk AI Agent (OpenCode, Antigravity, Codex, Claude Code)</span>
          </div>

          <div className="inline-flex p-0.5 rounded-full bg-white/10 text-[11px]">
            <button
              type="button"
              onClick={() => setCliFormat('steps-flags')}
              className={`px-3 py-1 rounded-full font-medium transition-colors ${
                cliFormat === 'steps-flags' ? 'bg-white text-[#1D1D1F]' : 'text-slate-300 hover:text-white'
              }`}
            >
              --step Flags
            </button>
            <button
              type="button"
              onClick={() => setCliFormat('json')}
              className={`px-3 py-1 rounded-full font-medium transition-colors ${
                cliFormat === 'json' ? 'bg-white text-[#1D1D1F]' : 'text-slate-300 hover:text-white'
              }`}
            >
              --steps JSON
            </button>
          </div>
        </div>

        <p className="text-xs text-[#A1A1A6] leading-relaxed">
          Seluruh {ALL_TOOLS.length} fungsi di aplikasi ini bersifat headless di{' '}
          <code className="text-emerald-300">src/core/</code> dan dapat dipanggil langsung oleh AI
          Agent melalui <strong>CLI</strong> maupun <strong>MCP Server (stdio)</strong>:
        </p>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-[#A1A1A6]">
            <span>Perintah Terminal / CLI untuk Pipeline Aktif di Atas:</span>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(cliCommand);
                setCopiedMode('cli');
                window.setTimeout(() => setCopiedMode(null), 1800);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-slate-100"
            >
              {copiedMode === 'cli' ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              <span>{copiedMode === 'cli' ? 'Tersalin' : 'Salin CLI'}</span>
            </button>
          </div>
          <pre className="p-3.5 rounded-2xl bg-black/50 border border-white/10 text-emerald-300 text-xs overflow-x-auto">
            {cliCommand}
          </pre>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-[#A1A1A6]">
            <span>
              Payload MCP Tool Call (<code className="text-white">tenggoo_pipeline_run</code>) via{' '}
              <code className="text-white">npm run mcp</code>:
            </span>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(mcpCallPayload);
                setCopiedMode('mcp');
                window.setTimeout(() => setCopiedMode(null), 1800);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-slate-100"
            >
              {copiedMode === 'mcp' ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              <span>{copiedMode === 'mcp' ? 'Tersalin' : 'Salin JSON MCP'}</span>
            </button>
          </div>
          <pre className="p-3.5 rounded-2xl bg-black/50 border border-white/10 text-sky-300 text-xs overflow-x-auto max-h-56">
            {mcpCallPayload}
          </pre>
        </div>
      </div>
    </div>
  );
};
