#!/usr/bin/env node
// dsh-plugin-startup-auditor — audita apps de inicio de Windows.
// Tools: status, audit.

import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';

const VERSION = '0.1.0';
const DSH_HOME = (() => {
  const v = process.env.DSH_HOME && process.env.DSH_HOME.trim();
  return v || path.join(process.env.USERPROFILE || process.env.HOME || os.homedir(), '.dsh');
})();
const CONFIG_FILE = path.join(DSH_HOME, 'startup-auditor', 'config.json');
const CACHE_DIR = path.join(DSH_HOME, 'cache', 'startup-auditor');
const STARTUP_EXT = /\.(lnk|exe|bat|cmd|vbs|ps1|url)$/i;
const RUN_KEYS = [
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
  'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce',
];
const SUSPICIOUS = [
  { regex: /(\\temp\\|\\tmp\\|%temp%)/i, message: 'lanza desde carpeta temporal' },
  { regex: /powershell.*(-enc|-encodedcommand|hidden|bypass)/i, message: 'PowerShell con evasión' },
  { regex: /wscript|cscript/i, message: 'script de Windows scripting host' },
  { regex: /cmd(\.exe)?\s+\/c/i, message: 'invoca cmd /c' },
  { regex: /(\\downloads\\|\\appdata\\local\\temp)/i, message: 'ruta de descargas/temp' },
];
const log = (m) => process.stderr.write(`[startup] ${m}\n`);

function loadConfig() {
  const defaultDirs = [path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup'), path.join(process.env.PROGRAMDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup')].filter(Boolean);
  try { if (existsSync(CONFIG_FILE)) { const data = JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) || {}; return { startupDirs: Array.isArray(data.startupDirs) && data.startupDirs.length ? data.startupDirs : defaultDirs, includeRegistry: data.includeRegistry !== false }; } } catch { /* defaults */ }
  return { startupDirs: defaultDirs, includeRegistry: true };
}
function folderEntries() {
  const entries = [];
  for (const dir of loadConfig().startupDirs) {
    if (!existsSync(dir)) continue;
    for (const entry of (() => { try { return readdirSync(dir, { withFileTypes: true }); } catch { return []; } })()) {
      if (!entry.isFile() || !STARTUP_EXT.test(entry.name)) continue;
      const full = path.join(dir, entry.name);
      let mtime = null;
      try { mtime = statSync(full).mtimeMs; } catch { /* ignora */ }
      entries.push({ source: 'carpeta', name: entry.name, command: full, mtime });
    }
  }
  return entries;
}
function registryEntries() {
  const entries = [];
  for (const key of RUN_KEYS) {
    const result = spawnSync('reg', ['query', key, '/s'], { encoding: 'utf8', timeout: 15000, windowsHide: true });
    if (result.status !== 0) continue;
    for (const line of (result.stdout || '').split('\n')) {
      const match = line.match(/^\s+(.+?)\s+REG_(?:SZ|EXPAND_SZ)\s+(.+)$/);
      if (!match) continue;
      entries.push({ source: 'registro', name: match[1].trim(), command: match[2].trim(), mtime: null });
    }
  }
  return entries;
}
function suspicious(command) { return SUSPICIOUS.filter((pattern) => pattern.regex.test(command)).map((pattern) => pattern.message); }
function audit(includeRegistry) {
  const entries = [...folderEntries(), ...(includeRegistry ? registryEntries() : [])];
  const enriched = entries.map((entry) => ({ ...entry, warnings: suspicious(entry.command) })).sort((a, b) => (b.warnings.length - a.warnings.length) || a.name.localeCompare(b.name));
  return { entries: enriched, total: enriched.length, warnings: enriched.filter((entry) => entry.warnings.length > 0).length };
}
function textResult(text) { return { content: [{ type: 'text', text }] }; }
function fmtDate(ms) { return ms ? new Date(ms).toISOString().slice(0, 10) : '?'; }

function buildInstructions() {
  return [
    'Startup Auditor: audita apps que arrancan con Windows.',
    '',
    'Herramientas: status, audit.',
    '',
    'Reglas:',
    '- Solo lectura: revisa carpeta de inicio y claves Run del registro.',
    '- Marca rutas temporales, PowerShell con evasión, wscript/cscript y cmd /c.',
    '- Reporta entradas reales; no desinstala ni modifica nada.',
  ].join('\n');
}

function buildServer() {
  const server = new McpServer({ name: 'dsh-plugin-startup-auditor', version: VERSION }, { capabilities: { tools: {} }, instructions: buildInstructions() });
  server.registerTool('status', { title: 'Estado', description: 'Carpetas, registro y modo.', inputSchema: z.object({}) }, async () => {
    const config = loadConfig();
    return textResult([`Carpetas: ${config.startupDirs.join(', ') || '(ninguna)'}`, `Registro: ${config.includeRegistry ? 'sí' : 'no'}`, 'Modo: solo lectura'].join('\n'));
  });
  server.registerTool('audit', { title: 'Auditar inicio', description: 'Lista entradas de inicio y marca sospechosas.', inputSchema: z.object({ includeRegistry: z.boolean().optional() }) }, async (args) => {
    const result = audit(args.includeRegistry ?? loadConfig().includeRegistry);
    if (result.total === 0) return textResult('Sin entradas de inicio detectadas en las fuentes revisadas.');
    return textResult([
      `Entradas: ${result.total} · sospechosas: ${result.warnings}`,
      '',
      ...result.entries.map((entry) => `- [${entry.source}] ${entry.name} (${fmtDate(entry.mtime)})${entry.warnings.length ? ` ⚠️ ${entry.warnings.join('; ')}` : ''}\n  ${entry.command.slice(0, 200)}`),
    ].join('\n'));
  });
  return server;
}

try { mkdirSync(CACHE_DIR, { recursive: true }); } catch { /* ignora */ }
log('startup-auditor listo');
serveStdio(buildServer, { onerror: (e) => log(`serveStdio: ${e.message}`) });
process.on('uncaughtException', (e) => log(`excepción: ${e.message}`));
process.on('unhandledRejection', (e) => log(`rechazo: ${e && e.message ? e.message : String(e)}`));
