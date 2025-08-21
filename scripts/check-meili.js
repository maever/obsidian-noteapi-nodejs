const host = process.env.MEILI_HOST ?? 'http://127.0.0.1:7700';
try {
  const res = await fetch(host + '/health');
  if (!res.ok) throw new Error('status ' + res.status);
} catch {
  console.error('Meilisearch not running at', host);
  process.exit(1);
}
