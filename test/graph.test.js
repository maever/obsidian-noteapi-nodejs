import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import Fastify from 'fastify';

function fm(content, frontmatter) {
  const fmLines = ['---'];
  for (const [k, v] of Object.entries(frontmatter)) {
    if (Array.isArray(v)) {
      fmLines.push(`${k}:`);
      for (const item of v) fmLines.push(`  - ${item}`);
    } else {
      fmLines.push(`${k}: ${v}`);
    }
  }
  fmLines.push('---');
  fmLines.push(content);
  return fmLines.join('\n');
}

test('graph endpoints provide backlinks, neighbors, aliases', async () => {
  const vault = await fs.mkdtemp(path.join(process.cwd(), 'vault-'));
  process.env.VAULT_ROOT = vault;
  process.env.NOTEAPI_KEY = 'testkey';

  const graphRoute = (await import('../dist/routes/graph.js')).default;

  await fs.writeFile(path.join(vault, 'a.md'), 'Link to [[b]]');
  await fs.writeFile(path.join(vault, 'b.md'), fm('content', { aliases: ['Beta'] }));

  const app = Fastify();
  await graphRoute(app);

  try {
    const bl = await app.inject({
      method: 'GET',
      url: '/graph/backlinks/b.md',
      headers: { authorization: 'Bearer testkey' }
    });
    assert.equal(bl.statusCode, 200);
    assert.deepEqual(bl.json().backlinks, ['a.md']);

    const al = await app.inject({
      method: 'GET',
      url: '/graph/aliases/b.md',
      headers: { authorization: 'Bearer testkey' }
    });
    assert.deepEqual(al.json().aliases, ['Beta']);

    const ne = await app.inject({
      method: 'GET',
      url: '/graph/neighbors/a.md',
      headers: { authorization: 'Bearer testkey' }
    });
    assert.deepEqual(ne.json().neighbors, ['b.md']);
  } finally {
    await app.close();
    await fs.rm(vault, { recursive: true, force: true });
  }
});
