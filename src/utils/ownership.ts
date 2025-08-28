import fs from 'node:fs';
import { CONFIG } from '../config.js';

export async function applyOwnership(p: string): Promise<void> {
  if (CONFIG.fileUid !== undefined && CONFIG.fileGid !== undefined) {
    await fs.promises.chown(p, CONFIG.fileUid, CONFIG.fileGid);
  }
}
