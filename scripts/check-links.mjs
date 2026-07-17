import { readFile } from 'node:fs/promises';

const grants = JSON.parse(await readFile(new URL('../data/grants.json', import.meta.url), 'utf8'));
const urls = [...new Set(grants.flatMap(grant => [grant.official_url, grant.current_cycle?.source_url]).filter(Boolean))];
const failures = [];

async function check(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'user-agent': 'EdZola-Funding-Directory-Link-Check/1.0' },
      signal: controller.signal,
    });
    const reachable = response.status < 400 || response.status === 401 || response.status === 403 || response.status === 429;
    console.log(`${reachable ? 'OK' : 'FAIL'} ${response.status} ${url}`);
    if (!reachable) failures.push({ url, status: response.status });
  } catch (error) {
    console.log(`FAIL ${error.name} ${url}`);
    failures.push({ url, status: error.name });
  } finally {
    clearTimeout(timeout);
  }
}

for (let index = 0; index < urls.length; index += 6) {
  await Promise.all(urls.slice(index, index + 6).map(check));
}

console.log(`Checked ${urls.length} unique official-source URLs; ${failures.length} failed.`);
if (failures.length) process.exit(1);
