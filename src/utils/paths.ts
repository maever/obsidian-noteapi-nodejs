import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';


export const CONFIG = {
    host: process.env.HOST ?? '127.0.0.1',
    port: Number(process.env.PORT ?? 3000),
    baseUrl: process.env.BASE_URL ?? 'http://127.0.0.1:3000',
    vaultRoot: process.env.VAULT_ROOT ?? '/vault',
    apiKey: process.env.NOTEAPI_KEY ?? '',
    meili: {
        host: process.env.MEILI_HOST ?? 'http://127.0.0.1:7700',
        key: process.env.MEILI_MASTER_KEY ?? '',
        index: process.env.MEILI_INDEX ?? 'notes'
    }
};


if (!fs.existsSync(CONFIG.vaultRoot)) {
    console.warn(`[WARN] VAULT_ROOT does not exist: ${CONFIG.vaultRoot}`);
}

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
  await fsp.mkdir(path.dirname(absPath), { recursive: true });
}