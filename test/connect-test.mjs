// Test end-to-end de startup-auditor.
import path from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const packageDir = path.resolve(import.meta.dirname, '..');
const tmpDir = path.join(packageDir, 'test', 'tmp');
rmSync(tmpDir, { recursive: true, force: true });
const home = path.join(tmpDir, 'dsh-home');
const fakeStartup = path.join(tmpDir, 'startup');
const tempDir = path.join(fakeStartup, 'temp');
mkdirSync(path.join(home, 'startup-auditor'), { recursive: true });
mkdirSync(tempDir, { recursive: true });
writeFileSync(path.join(home, 'startup-auditor', 'config.json'), JSON.stringify({ startupDirs: [fakeStartup, tempDir], includeRegistry: false }), 'utf8');
writeFileSync(path.join(fakeStartup, 'app-buena.lnk'), 'lnk', 'utf8');
writeFileSync(path.join(tempDir, 'evil.bat'), 'echo hola', 'utf8');

function makeClient() {
  const entry = process.env.STARTUP_SERVER ? path.resolve(process.env.STARTUP_SERVER) : path.join(packageDir, 'server.mjs');
  const transport = new StdioClientTransport({ command: process.execPath, args: [entry], env: { SystemRoot: process.env.SystemRoot || 'C:\\Windows', PATH: process.env.PATH, USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME || process.env.USERPROFILE, TEMP: process.env.TEMP, TMP: process.env.TMP, DSH_HOME: home }, stderr: 'pipe' });
  transport.stderr?.on('data', (c) => process.stderr.write(`[server] ${c}`));
  const client = new Client({ name: 'startup-test', version: '1.0.0' }, { capabilities: {}, versionNegotiation: { mode: 'auto' } });
  return client.connect(transport).then(() => ({ client, transport }));
}
const textOf = (r) => (r.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');

const { client, transport } = await makeClient();
console.log('tools:', (await client.listTools()).tools.map((t) => t.name).join(', '));
const status = textOf(await client.callTool({ name: 'status', arguments: {} }));
console.log('--- status ---'); console.log(status);
console.log('usa carpeta de prueba:', status.includes('startup'));
console.log('registro desactivado:', status.includes('Registro: no'));
const report = textOf(await client.callTool({ name: 'audit', arguments: { includeRegistry: false } }));
console.log('--- audit ---'); console.log(report);
console.log('entradas 2:', report.includes('Entradas: 2'));
console.log('nombres:', report.includes('app-buena.lnk') && report.includes('evil.bat'));
console.log('marca sospechosa:', report.includes('temporal') && report.includes('⚠️'));
console.log('fuente carpeta:', report.includes('[carpeta]'));
await client.close(); try { await transport.close?.(); } catch {}
console.log('OK');
