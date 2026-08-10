import paramiko, time, sys

# Force UTF-8 output
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

HOST = '159.89.160.71'
USER = 'enarxi-staging'
PASSWORD = 'Enarxi12345@'
ROOT_PASS = 'Enarxi12345@'

def run(shell, cmd, wait=5):
    print('>> ' + cmd)
    shell.send(cmd + '\n')
    time.sleep(wait)
    out = ''
    while shell.recv_ready():
        out += shell.recv(65535).decode('utf-8', errors='replace')
    if out.strip():
        print(out.strip())
    return out

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print('\n[1/8] Connecting as enarxi-staging...')
client.connect(HOST, username=USER, password=PASSWORD, timeout=15)
print('      Connected OK!')

shell = client.invoke_shell(width=220, height=50)
time.sleep(2)
if shell.recv_ready():
    shell.recv(65535)

# ── Step 1: Git pull ─────────────────────────────────────────────
print('\n[2/8] Pulling latest code...')
run(shell, 'cd /home/enarxi-staging/IPMS-Enarxi && git fetch origin', 6)
run(shell, 'git reset --hard origin/Inventory-setup', 8)

# ── Step 2: Install pnpm on server if missing ────────────────────
print('\n[3/8] Ensuring pnpm is available...')
run(shell, 'which pnpm || npm install -g pnpm --silent', 20)
run(shell, 'pnpm --version', 3)

# ── Step 3: Install server deps ──────────────────────────────────
print('\n[4/8] Installing server dependencies...')
run(shell, 'cd /home/enarxi-staging/IPMS-Enarxi/server && npm install --omit=dev 2>&1 | tail -5', 40)

# ── Step 4: Install client deps with pnpm ────────────────────────
print('\n[5/8] Installing client dependencies (pnpm)...')
run(shell, 'cd /home/enarxi-staging/IPMS-Enarxi/client && pnpm install --ignore-scripts 2>&1 | tail -8', 60)

# ── Step 5: Build frontend ───────────────────────────────────────
print('\n[6/8] Building PWA frontend...')
run(shell, 'cd /home/enarxi-staging/IPMS-Enarxi/client && pnpm run build 2>&1 | tail -15', 90)

# ── Step 6: Publish to nginx root ────────────────────────────────
print('\n[7/8] Publishing to /var/www/tracker.enarxi.com...')
run(shell, 'sudo rm -rf /var/www/tracker.enarxi.com/*', 3)
run(shell, ROOT_PASS, 4)
run(shell, 'sudo cp -r /home/enarxi-staging/IPMS-Enarxi/client/dist/* /var/www/tracker.enarxi.com/', 8)
run(shell, 'sudo chown -R www-data:www-data /var/www/tracker.enarxi.com/', 4)
run(shell, 'ls /var/www/tracker.enarxi.com/', 3)

# ── Step 7: Restart PM2 ──────────────────────────────────────────
print('\n[8/8] Restarting PM2 backend...')
run(shell, 'pm2 restart ipms-backend', 8)
run(shell, 'pm2 save', 4)
run(shell, 'pm2 list', 5)

print('\n========================================')
print('  DEPLOYMENT COMPLETE')
print('  https://tracker.enarxi.com')
print('========================================\n')
client.close()
