import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { guessMimeType, sanitizeFileName } from '../core/types.ts';
import type { VirtualFile } from '../core/types.ts';

export const MAX_INPUT_FILE_BYTES = 200 * 1024 * 1024;
export const MAX_TOTAL_INPUT_BYTES = 500 * 1024 * 1024;

export interface FileIOOptions {
  allowedRoots?: string[];
  maxFileBytes?: number;
  maxTotalBytes?: number;
}

function normalizeForCompare(target: string): string {
  return process.platform === 'win32' ? target.toLowerCase() : target;
}

export function isPathWithinRoot(candidatePath: string, rootPath: string): boolean {
  const normCandidate = normalizeForCompare(resolve(candidatePath));
  const normRoot = normalizeForCompare(resolve(rootPath));
  const rel = relative(normRoot, normCandidate);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

async function resolveNearestRealPath(targetPath: string): Promise<string> {
  const abs = resolve(targetPath);
  const trailing: string[] = [];
  let current = abs;

  while (true) {
    try {
      const real = await realpath(current);
      return trailing.length > 0 ? resolve(real, ...trailing.reverse()) : real;
    } catch {
      const parent = dirname(current);
      if (parent === current) {
        return abs;
      }
      trailing.push(basename(current));
      current = parent;
    }
  }
}

export async function assertPathAllowed(
  targetPath: string,
  allowedRoots?: string[],
): Promise<string> {
  const absPath = resolve(targetPath);
  if (!allowedRoots || allowedRoots.length === 0) {
    return absPath;
  }

  const realCandidate = await resolveNearestRealPath(absPath);
  for (const root of allowedRoots) {
    const realRoot = await resolveNearestRealPath(root);
    if (isPathWithinRoot(realCandidate, realRoot)) {
      return realCandidate;
    }
  }

  throw new Error(`Access denied: path "${absPath}" is outside allowed workspace directories.`);
}

export async function readInputPaths(
  inputPaths: string[],
  options?: FileIOOptions,
): Promise<VirtualFile[]> {
  const maxFileBytes = options?.maxFileBytes ?? MAX_INPUT_FILE_BYTES;
  const maxTotalBytes = options?.maxTotalBytes ?? MAX_TOTAL_INPUT_BYTES;
  const loaded: VirtualFile[] = [];
  let totalBytes = 0;

  for (const rawPath of inputPaths) {
    const safePath = await assertPathAllowed(rawPath, options?.allowedRoots);
    const info = await stat(safePath);
    if (!info.isFile()) {
      throw new Error(`Input path is not a regular file: "${safePath}".`);
    }
    if (info.size > maxFileBytes) {
      throw new Error(
        `Input file "${basename(safePath)}" (${info.size} bytes) exceeds maximum allowed limit (${maxFileBytes} bytes).`,
      );
    }
    totalBytes += info.size;
    if (totalBytes > maxTotalBytes) {
      throw new Error(
        `Total input file size exceeds maximum allowed limit (${maxTotalBytes} bytes).`,
      );
    }

    const buffer = await readFile(safePath);
    const name = sanitizeFileName(basename(safePath), 'input.bin');
    loaded.push({
      name,
      mimeType: guessMimeType(name),
      bytes: new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength),
      metadata: { sourcePath: safePath },
    });
  }
  return loaded;
}

export async function writeOutputFiles(
  files: VirtualFile[],
  outputTarget?: string,
  options?: FileIOOptions,
): Promise<string[]> {
  if (files.length === 0) return [];

  const writtenPaths: string[] = [];

  if (!outputTarget) {
    const baseDir = await assertPathAllowed(process.cwd(), options?.allowedRoots);
    for (const file of files) {
      const safeName = sanitizeFileName(file.name, 'output.bin');
      const target = resolve(baseDir, safeName);
      if (!isPathWithinRoot(target, baseDir)) {
        throw new Error(`Unsafe output filename rejected: "${file.name}".`);
      }
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.bytes);
      writtenPaths.push(target);
    }
    return writtenPaths;
  }

  const absTarget = await assertPathAllowed(outputTarget, options?.allowedRoots);
  let treatAsDir = files.length > 1 || outputTarget.endsWith('/') || outputTarget.endsWith('\\');

  if (!treatAsDir) {
    try {
      const info = await stat(absTarget);
      if (info.isDirectory()) {
        treatAsDir = true;
      }
    } catch {
      // Target does not exist yet: treat as file if it has an extension
      treatAsDir = extname(absTarget) === '';
    }
  }

  if (treatAsDir) {
    await mkdir(absTarget, { recursive: true });
    for (const file of files) {
      const safeName = sanitizeFileName(file.name, 'output.bin');
      const dest = resolve(absTarget, safeName);
      if (!isPathWithinRoot(dest, absTarget)) {
        throw new Error(`Unsafe output filename rejected: "${file.name}".`);
      }
      await writeFile(dest, file.bytes);
      writtenPaths.push(dest);
    }
  } else {
    await mkdir(dirname(absTarget), { recursive: true });
    await writeFile(absTarget, files[0].bytes);
    writtenPaths.push(absTarget);
  }

  return writtenPaths;
}
