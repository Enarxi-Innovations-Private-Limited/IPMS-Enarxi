import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const bomDir = path.join(rootDir, 'server', 'BOM');
const bomPort = '8100';
const bomUrl = `http://127.0.0.1:${bomPort}`;
const pnpmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const args = new Set(process.argv.slice(2));
const bomOnly = args.has('--bom-only');
const dryRun = args.has('--dry-run');
const skipBom = args.has('--skip-bom');

function resolveBomPython() {
    const venvPython = process.platform === 'win32'
        ? path.join(bomDir, 'venv', 'Scripts', 'python.exe')
        : path.join(bomDir, 'venv', 'bin', 'python');
    return existsSync(venvPython) ? venvPython : 'python';
}

function terminateProcessTree(child) {
    if (!child?.pid) return;
    try {
        if (process.platform === 'win32') {
            execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
            return;
        }
        child.kill('SIGTERM');
    } catch {
        // Ignore shutdown failures during local dev stop.
    }
}

function hasBomDependency(pythonExe) {
    try {
        execFileSync(pythonExe, ['-c', 'import uvicorn'], {
            cwd: bomDir,
            stdio: 'ignore'
        });
        return true;
    } catch {
        return false;
    }
}

function spawnProcess(label, command, commandArgs, options = {}) {
    console.log(`[root-dev] starting ${label}: ${command} ${commandArgs.join(' ')}`);
    if (dryRun) return null;

    const shouldUseCmdShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(command);

    const child = spawn(command, commandArgs, {
        cwd: options.cwd || rootDir,
        stdio: 'inherit',
        env: {
            ...process.env,
            FORCE_COLOR: process.env.FORCE_COLOR || '1',
            ...options.env
        },
        shell: shouldUseCmdShell
    });

    child.on('exit', (code, signal) => {
        if (shuttingDown) return;
        if (code === 0 || signal === 'SIGTERM' || signal === 'SIGINT') return;
        if (options.optional) {
            console.warn(`[root-dev] optional ${label} exited (${signal || code}). Continuing without it.`);
            return;
        }
        console.error(`[root-dev] ${label} exited unexpectedly (${signal || code}).`);
        shutdown(code || 1);
    });

    return child;
}

const children = [];
let shuttingDown = false;

function shutdown(exitCode = 0) {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const child of children) {
        terminateProcessTree(child);
    }
    setTimeout(() => process.exit(exitCode), 150);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

const bomPython = resolveBomPython();
const bomArgs = ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', bomPort, '--reload'];
const shouldStartBom = !skipBom && hasBomDependency(bomPython);

if (!shouldStartBom) {
    const bomMessage = `[root-dev] BOM service skipped: ${skipBom ? '--skip-bom was provided' : `uvicorn is not installed for ${bomPython}`}.`;
    if (bomOnly) {
        console.error(`${bomMessage} Install BOM dependencies from server/BOM/requirements.txt first.`);
        process.exit(1);
    }
    console.warn(`${bomMessage} Frontend and backend will still start.`);
}

if (bomOnly) {
    const bomChild = spawnProcess('bom', bomPython, bomArgs, { env: { PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' }, cwd: bomDir });
    if (bomChild) children.push(bomChild);
} else {
    const frontendChild = spawnProcess('frontend', pnpmCmd, ['--filter', 'client', 'run', 'dev'], {
        env: {
            NODE_ENV: 'development'
        }
    });
    const backendChild = spawnProcess('backend', pnpmCmd, ['--filter', 'server', 'run', 'dev'], {
        env: {
            NODE_ENV: 'development',
            BOM_AUTOSPAWN: 'false',
            BOM_URL: bomUrl
        }
    });
    let bomChild = null;
    if (shouldStartBom) {
        bomChild = spawnProcess('bom', bomPython, bomArgs, {
            env: {
                PYTHONUNBUFFERED: '1',
                PYTHONIOENCODING: 'utf-8'
            },
            cwd: bomDir,
            optional: true
        });
    }

    if (frontendChild) children.push(frontendChild);
    if (backendChild) children.push(backendChild);
    if (bomChild) children.push(bomChild);
}

if (dryRun) {
    console.log('[root-dev] dry run complete.');
} else {
    console.log(`[root-dev] frontend + backend + BOM are starting from ${rootDir}`);
}
