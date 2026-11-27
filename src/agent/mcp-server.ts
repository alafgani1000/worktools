import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { getTool, listTools } from '../core/registry.ts';
import { runPipeline } from '../core/pipeline.ts';
import { formatByteSize } from '../core/types.ts';
import type { PipelineStep, ToolDefinition } from '../core/types.ts';
import { readInputPaths, writeOutputFiles } from './fileIO.ts';

function getAllowedRoots(): string[] {
  const configured =
    process.env.TENGGOO_WORKSPACE_ROOT || process.env.TENGGOO_ALLOWED_ROOTS || '';
  if (configured.trim()) {
    const sep = configured.includes(delimiter) ? delimiter : ',';
    const parsed = configured
      .split(sep)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => resolve(s));
    if (parsed.length > 0) return parsed;
  }
  return [resolve(process.cwd()), resolve(join(tmpdir(), 'worktools'))];
}

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface McpToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

function writeResponse(payload: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function sendResult(id: string | number | null, result: unknown): void {
  writeResponse({
    jsonrpc: '2.0',
    id,
    result,
  });
}

function sendError(id: string | number | null, code: number, message: string): void {
  writeResponse({
    jsonrpc: '2.0',
    id,
    error: { code, message },
  });
}

function buildMcpTools(): McpToolDescriptor[] {
  const all = listTools();

  const individualTools: McpToolDescriptor[] = all.map((tool: ToolDefinition) => {
    const requiredFields = new Set<string>(tool.parameterSchema.required ?? []);
    if (tool.minInputs > 0) {
      requiredFields.add('input_paths');
    }

    return {
      name: tool.mcpName,
      description: `[${tool.category.toUpperCase()} | ${tool.id}] ${tool.description}`,
      inputSchema: {
        type: 'object',
        properties: {
          input_paths: {
            type: 'array',
            items: { type: 'string' },
            description: `List of input file paths on disk (${tool.minInputs}..${tool.maxInputs ?? 'many'} files).`,
          },
          output_path: {
            type: 'string',
            description: 'Optional output file path or output directory.',
          },
          ...tool.parameterSchema.properties,
        },
        ...(requiredFields.size > 0 ? { required: Array.from(requiredFields) } : {}),
      },
    };
  });

  const pipelineTool: McpToolDescriptor = {
    name: 'tenggoo_pipeline_run',
    description:
      'Execute a multi-step processing pipeline combining any sequence of PDF, Image, and Utility tools (e.g. image.resize -> image.compress -> pdf.from_images -> pdf.watermark -> pdf.page_numbers).',
    inputSchema: {
      type: 'object',
      properties: {
        input_paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Initial input file paths on disk (optional for generator-first pipelines like util.qr_generate or util.md_to_pdf).',
        },
        output_path: {
          type: 'string',
          description: 'Optional output file path or directory for final output files.',
        },
        steps: {
          type: 'array',
          description: 'Ordered list of pipeline steps to execute.',
          items: {
            type: 'object',
            properties: {
              tool: {
                type: 'string',
                description: 'Tool ID (e.g. "pdf.merge", "image.compress", "util.qr_generate").',
              },
              params: {
                type: 'object',
                description: 'Parameter object for the tool.',
              },
            },
            required: ['tool'],
          },
        },
      },
      required: ['steps'],
    },
  };

  return [...individualTools, pipelineTool];
}

function isInspectionTool(toolId: string, params: Record<string, unknown>): boolean {
  if (
    toolId === 'pdf.extract_text' ||
    toolId === 'pdf.extract_tables' ||
    toolId === 'pdf.form_inspect' ||
    toolId === 'pdf.diff_text' ||
    toolId === 'image.info' ||
    toolId === 'util.hash_checksum'
  ) {
    return true;
  }
  if (toolId === 'pdf.metadata' && (params.action ?? 'inspect') === 'inspect') return true;
  return false;
}

async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
): Promise<{ content: { type: 'text'; text: string }[]; isError?: boolean }> {
  try {
    const ioOptions = { allowedRoots: getAllowedRoots() };
    const inputPaths = Array.isArray(args.input_paths)
      ? args.input_paths.map((p) => String(p))
      : [];
    const outputPath = typeof args.output_path === 'string' ? args.output_path : undefined;
    const inputFiles = await readInputPaths(inputPaths, ioOptions);

    if (name === 'tenggoo_pipeline_run') {
      const steps = Array.isArray(args.steps) ? (args.steps as PipelineStep[]) : [];
      const result = await runPipeline(inputFiles, steps);
      const lastStep = steps[steps.length - 1];
      const skipWrite =
        !outputPath && lastStep && isInspectionTool(lastStep.tool, lastStep.params ?? {});
      const written = skipWrite ? [] : await writeOutputFiles(result.files, outputPath, ioOptions);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                ok: true,
                totalDurationMs: result.totalDurationMs,
                steps: result.steps,
                outputs: result.files.map((f, idx) => ({
                  name: f.name,
                  mimeType: f.mimeType,
                  bytes: f.bytes.byteLength,
                  sizeFormatted: formatByteSize(f.bytes.byteLength),
                  path: written[idx] ?? null,
                  metadata: f.metadata ?? null,
                })),
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    const tool = getTool(name);
    if (!tool) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Unknown Tenggoo MCP tool: "${name}".` }],
      };
    }

    const toolParams: Record<string, unknown> = { ...args };
    delete toolParams.input_paths;
    delete toolParams.output_path;

    const result = await tool.execute(inputFiles, toolParams);
    const skipWrite = !outputPath && isInspectionTool(tool.id, toolParams);
    const written = skipWrite ? [] : await writeOutputFiles(result.files, outputPath, ioOptions);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              ok: true,
              tool: tool.id,
              summary: result.summary,
              outputs: result.files.map((f, idx) => ({
                name: f.name,
                mimeType: f.mimeType,
                bytes: f.bytes.byteLength,
                sizeFormatted: formatByteSize(f.bytes.byteLength),
                path: written[idx] ?? null,
                metadata: f.metadata ?? null,
              })),
              metadata: result.metadata ?? null,
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      isError: true,
      content: [{ type: 'text', text: `Error executing ${name}: ${msg}` }],
    };
  }
}

async function dispatchRequest(req: JsonRpcRequest): Promise<void> {
  const id = req.id ?? null;
  const isNotification = req.id === undefined || req.id === null;

  if (req.method === 'initialize') {
    const requestedVersion =
      typeof req.params?.protocolVersion === 'string'
        ? req.params.protocolVersion
        : '2024-11-05';
    sendResult(id, {
      protocolVersion: requestedVersion,
      capabilities: {
        tools: {},
      },
      serverInfo: {
        name: 'tenggoo-toolkit',
        version: '1.1.1',
      },
    });
    return;
  }

  if (req.method.startsWith('notifications/')) {
    return;
  }

  if (req.method === 'ping') {
    sendResult(id, {});
    return;
  }

  if (req.method === 'tools/list') {
    sendResult(id, {
      tools: buildMcpTools(),
    });
    return;
  }

  if (req.method === 'tools/call') {
    const callName = typeof req.params?.name === 'string' ? req.params.name : '';
    const callArgs =
      req.params?.arguments && typeof req.params.arguments === 'object'
        ? (req.params.arguments as Record<string, unknown>)
        : {};
    const toolResult = await handleToolCall(callName, callArgs);
    sendResult(id, toolResult);
    return;
  }

  if (!isNotification) {
    sendError(id, -32601, `Method not found: ${req.method}`);
  }
}

const MAX_STDIN_LINE_BYTES = 10 * 1024 * 1024;

function startMcpServer(): void {
  let buffer = '';
  let droppingOversizedLine = false;
  let chain = Promise.resolve();

  const enqueueLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    chain = chain.then(async () => {
      try {
        const parsed = JSON.parse(trimmed) as JsonRpcRequest;
        await dispatchRequest(parsed);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[tenggoo-mcp] Invalid JSON-RPC message: ${msg}\n`);
      }
    });
  };

  process.stdin.setEncoding('utf-8');
  process.stdin.on('data', (chunk: string) => {
    buffer += chunk;

    if (droppingOversizedLine) {
      const newlineIdx = buffer.indexOf('\n');
      if (newlineIdx === -1) {
        buffer = '';
        return;
      }
      buffer = buffer.slice(newlineIdx + 1);
      droppingOversizedLine = false;
    }

    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      if (Buffer.byteLength(line, 'utf-8') > MAX_STDIN_LINE_BYTES) {
        process.stderr.write('[tenggoo-mcp] Request line exceeds 10 MB limit and was dropped.\n');
        sendError(null, -32600, 'Request exceeds maximum allowed size');
      } else {
        enqueueLine(line);
      }
      newlineIndex = buffer.indexOf('\n');
    }

    if (Buffer.byteLength(buffer, 'utf-8') > MAX_STDIN_LINE_BYTES) {
      process.stderr.write('[tenggoo-mcp] Buffered stdin exceeded 10 MB limit without newline.\n');
      sendError(null, -32600, 'Request exceeds maximum allowed size');
      buffer = '';
      droppingOversizedLine = true;
    }
  });

  process.stdin.on('end', () => {
    if (droppingOversizedLine) {
      buffer = '';
      return;
    }
    if (buffer.trim()) {
      if (Buffer.byteLength(buffer, 'utf-8') > MAX_STDIN_LINE_BYTES) {
        sendError(null, -32600, 'Request exceeds maximum allowed size');
      } else {
        enqueueLine(buffer);
      }
      buffer = '';
    }
  });
}

startMcpServer();
