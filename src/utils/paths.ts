import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { CONFIG } from '../config.js';
import { applyOwnership } from './ownership.js';

const REAL_VAULT_ROOT = fs.existsSync(CONFIG.vaultRoot)
    ? fs.realpathSync(CONFIG.vaultRoot)
    : path.resolve(CONFIG.vaultRoot);


export function isMarkdown(path: string): boolean {
  return path.toLowerCase().endsWith('.md');
}


export function vaultResolve(rel: string): string {
  // Normalize and join with vault root
  const abs = path.resolve(REAL_VAULT_ROOT, rel);
  // Resolve symlinks if the path exists; for new paths fall back to the
  // computed absolute path so we can create files in yet-to-exist folders.
  let real: string;
  try {
    real = fs.realpathSync(abs);
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      real = abs;
    } else {
      throw err;
    }
  }
  if (!real.startsWith(REAL_VAULT_ROOT + path.sep) && real !== REAL_VAULT_ROOT) {
    throw new Error('Path traversal detected');
  }
  return real;
}

export async function ensureParentDir(absPath: string): Promise<void> {
  const dir = path.dirname(absPath);
  await fsp.mkdir(dir, { recursive: true });
  await applyOwnership(dir);
}