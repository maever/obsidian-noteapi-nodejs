import { FastifyInstance } from 'fastify';
import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { CONFIG } from '../config.js';
import { vaultResolve, isMarkdown } from '../utils/paths.js';

interface NoteInfo {
    path: string;
    links: string[];
    aliases: string[];
}

function extractLinks(content: string): string[] {
    const links: string[] = [];
    const re = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content))) {
        const t = m[1].trim();
        links.push(t);
    }
    return links;
}

function normalizeLink(link: string): string {
    let p = link.trim();
    if (!p.toLowerCase().endsWith('.md')) p += '.md';
    return p;
}

async function walk(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const e of entries) {
        if (e.name === '.stfolder') continue;
        if (e.name.startsWith('.')) continue;
        const abs = path.join(dir, e.name);
        if (e.isDirectory()) {
            files.push(...await walk(abs));
        } else if (e.isFile()) {
            if (!isMarkdown(abs)) continue;
            if (e.name.includes('sync-conflict')) continue;
            files.push(abs);
        }
    }
    return files;
}

async function loadNotes(): Promise<NoteInfo[]> {
    const absPaths = await walk(CONFIG.vaultRoot);
    const notes: NoteInfo[] = [];
    for (const abs of absPaths) {
        const rel = path.relative(CONFIG.vaultRoot, abs).split(path.sep).join('/');
        const buf = await fs.readFile(abs, 'utf8');
        const parsed = matter(buf);
        const aliasesVal = (parsed.data as any)?.aliases ?? (parsed.data as any)?.alias;
        const aliases = Array.isArray(aliasesVal)
            ? aliasesVal.map((a: any) => String(a))
            : aliasesVal ? [String(aliasesVal)] : [];
        const links = extractLinks(parsed.content).map(normalizeLink);
        notes.push({ path: rel, links, aliases });
    }
    return notes;
}

export default async function route(app: FastifyInstance) {
    app.addHook('onRequest', async (req, reply) => {
        const auth = req.headers['authorization'];
        const key = (auth ?? '').toString().replace(/^Bearer\s+/i, '');
        if (!key || key !== CONFIG.apiKey) {
            reply.code(401).send({ error: 'Unauthorized' });
        }
    });

    app.get('/graph/aliases/*', async (req, reply) => {
        const p = (req.params as any)['*'];
        let abs: string;
        try {
            abs = vaultResolve(p);
        } catch {
            return reply.code(400).send({ error: 'Invalid path' });
        }
        if (!isMarkdown(abs)) return reply.code(400).send({ error: 'Not a Markdown path' });
        try {
            await fs.access(abs);
        } catch {
            return reply.code(404).send({ error: 'Not found' });
        }
        const notes = await loadNotes();
        const note = notes.find(n => n.path === p);
        if (!note) return reply.code(404).send({ error: 'Not found' });
        return { aliases: note.aliases };
    });

    app.get('/graph/backlinks/*', async (req, reply) => {
        const p = (req.params as any)['*'];
        let abs: string;
        try {
            abs = vaultResolve(p);
        } catch {
            return reply.code(400).send({ error: 'Invalid path' });
        }
        if (!isMarkdown(abs)) return reply.code(400).send({ error: 'Not a Markdown path' });
        try {
            await fs.access(abs);
        } catch {
            return reply.code(404).send({ error: 'Not found' });
        }
        const notes = await loadNotes();
        const note = notes.find(n => n.path === p);
        if (!note) return reply.code(404).send({ error: 'Not found' });
        const targetBase = p.replace(/\.md$/i, '').toLowerCase();
        const aliasSet = new Set(note.aliases.map(a => a.toLowerCase()));
        const backlinks = notes
            .filter(n => n.path !== p && n.links.some(l => {
                const base = l.replace(/\.md$/i, '').toLowerCase();
                return base === targetBase || aliasSet.has(base);
            }))
            .map(n => n.path);
        return { backlinks };
    });

    app.get('/graph/neighbors/*', async (req, reply) => {
        const p = (req.params as any)['*'];
        let abs: string;
        try {
            abs = vaultResolve(p);
        } catch {
            return reply.code(400).send({ error: 'Invalid path' });
        }
        if (!isMarkdown(abs)) return reply.code(400).send({ error: 'Not a Markdown path' });
        try {
            await fs.access(abs);
        } catch {
            return reply.code(404).send({ error: 'Not found' });
        }
        const notes = await loadNotes();
        const note = notes.find(n => n.path === p);
        if (!note) return reply.code(404).send({ error: 'Not found' });
        const targetBase = p.replace(/\.md$/i, '').toLowerCase();
        const aliasSet = new Set(note.aliases.map(a => a.toLowerCase()));
        const backlinks = notes
            .filter(n => n.path !== p && n.links.some(l => {
                const base = l.replace(/\.md$/i, '').toLowerCase();
                return base === targetBase || aliasSet.has(base);
            }))
            .map(n => n.path);
        const neighbors = Array.from(new Set([...note.links, ...backlinks]));
        return { neighbors };
    });
}

