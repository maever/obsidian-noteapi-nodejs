import fs from 'node:fs';

const fileUmask = process.env.FILE_UMASK ? Number.parseInt(process.env.FILE_UMASK, 8) : 0;
process.umask(fileUmask);

export const CONFIG = {
  host: process.env.HOST ?? '127.0.0.1',
  port: Number(process.env.PORT ?? 3000),
  baseUrl: process.env.BASE_URL ?? 'http://127.0.0.1:3000',
  vaultRoot: process.env.VAULT_ROOT ?? '/vault',
  apiKey: process.env.NOTEAPI_KEY ?? '',
  trashEnabled: process.env.TRASH_ENABLED === 'true',
  fileUid: process.env.FILE_UID ? Number(process.env.FILE_UID) : undefined,
  fileGid: process.env.FILE_GID ? Number(process.env.FILE_GID) : undefined,
  fileUmask,
  meili: {
    host: process.env.MEILI_HOST ?? 'http://127.0.0.1:7700',
    key: process.env.MEILI_MASTER_KEY ?? '',
    index: process.env.MEILI_INDEX ?? 'notes'
  }
};

if (!fs.existsSync(CONFIG.vaultRoot)) {
  console.warn(`[WARN] VAULT_ROOT does not exist: ${CONFIG.vaultRoot}`);
}