import crypto from 'node:crypto';

export function strongEtagFromBuffer(buf: Buffer): string {
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    return `"${hash}"`;
}