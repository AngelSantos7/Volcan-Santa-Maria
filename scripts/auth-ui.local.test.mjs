// Optional browser regression using an already-installed Playwright runtime.
// No dependency install, traces, screenshots, request bodies or credential logs.
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const root = new URL('../', import.meta.url);
const url = new URL(process.env.SUPABASE_TEST_URL ?? 'http://127.0.0.1:54321');
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Loopback Auth only');
const key = process.env.SUPABASE_TEST_ANON_KEY;
const service = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
if (!key || !service || !process.env.PLAYWRIGHT_MODULE_PATH) throw new Error('Local keys and existing Playwright module path are required');
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href);
const admin = createClient(url.href, service, { auth: { persistSession: false, autoRefreshToken: false } });
const accounts = [];
const paths = [];
const servers = [];
let browser;
let stage = 'setup';
const secret = () => `Aa9!${randomBytes(16).toString('hex')}`;
const ensure = (condition, message) => { if (!condition) throw new Error(message); };
try {
  const harnesses = [
    ['PWA', '', 5177, `
import { createRoot } from 'react-dom/client';
import '../src/i18n';
import { AuthProvider } from '../src/features/auth/AuthProvider';
import { PasswordRecoveryPage } from '../src/pages/PasswordRecoveryPage';
import { supabase } from '../src/lib/supabase';
window.signInFixture = async (email,password) => !(await supabase.auth.signInWithPassword({email,password})).error;
createRoot(document.getElementById('root')).render(<AuthProvider><PasswordRecoveryPage changing onPasswordUpdated={()=>{document.getElementById('result').textContent='SAVED'}}/></AuthProvider>);
`],
    ['Admin', 'admin-web/', 5178, `
import { createRoot } from 'react-dom/client';
import { AccountPassword } from '../src/components/AccountPassword';
import { supabase } from '../src/lib/supabase';
window.signInFixture = async (email,password) => !(await supabase.auth.signInWithPassword({email,password})).error;
createRoot(document.getElementById('root')).render(<AccountPassword onSaved={async()=>{document.getElementById('result').textContent='SAVED'}}/>);
`],
  ];
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const [label, base, port, code] of harnesses) {
    stage = `${label} setup`;
    const directory = new URL(`${base}.auth-security.local/`, root);
    await mkdir(directory); // Refuse to overwrite a pre-existing test directory.
    paths.push(directory);
    await writeFile(new URL('index.html', directory), '<div id="root"></div><div id="result"></div><script type="module" src="./harness.tsx"></script>');
    await writeFile(new URL('harness.tsx', directory), code);
    servers.push(spawn(process.execPath, [fileURLToPath(new URL(`${base}node_modules/vite/bin/vite.js`, root)), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
      cwd: new URL(base || './', root), windowsHide: true, stdio: 'ignore',
      env: { ...process.env, VITE_SUPABASE_URL: url.href, VITE_SUPABASE_PUBLISHABLE_KEY: key },
    }));
    const origin = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      try { if ((await fetch(`${origin}/.auth-security.local/index.html`)).ok) { ready = true; break; } } catch { /* startup */ }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    ensure(ready, `${label} local UI server failed`);
    const email = `p1-ui-${randomUUID()}@example.invalid`;
    const previous = secret();
    const next = secret();
    const account = await admin.auth.admin.createUser({ email, password: previous, email_confirm: true, user_metadata: { date_of_birth: '1990-01-01' } });
    ensure(!account.error && account.data.user, `${label} fixture creation failed`);
    accounts.push(account.data.user.id);
    if (label === 'Admin') ensure(!(await admin.from('user_roles').update({ role: 'admin' }).eq('user_id', account.data.user.id)).error, 'Synthetic Admin role failed');
    const context = await browser.newContext({ locale: 'es-GT', serviceWorkers: 'block' });
    const page = await context.newPage();
    stage = `${label} page load`;
    await page.goto(`${origin}/.auth-security.local/index.html`);
    await page.waitForFunction(() => typeof window.signInFixture === 'function');
    ensure(await page.evaluate(async ({ email, password }) => window.signInFixture(email, password), { email, password: previous }), `${label} browser sign-in failed`);
    stage = `${label} form`;
    const currentField = label === 'PWA' ? page.locator('[name="currentPassword"]') : page.getByLabel('Contraseña actual', { exact: true });
    const newField = label === 'PWA' ? page.locator('[name="password"]') : page.getByLabel('Nueva contraseña', { exact: true });
    const confirmField = label === 'PWA' ? page.locator('[name="confirmPassword"]') : page.getByLabel('Confirmar nueva contraseña', { exact: true });
    const submit = page.locator('form button[type="submit"], form button:not([type])').first();
    await currentField.fill(previous);
    await newField.fill('VOLCAN25');
    await confirmField.fill('VOLCAN25');
    await submit.click();
    ensure((await page.locator('.password-rules').innerText()).includes('○ Incluye una letra minúscula'), `${label} missing lowercase rule`);
    ensure((await page.locator('#result').innerText()) !== 'SAVED', `${label} accepted uppercase-only password`);
    await newField.fill(next);
    await confirmField.fill(next);
    stage = `${label} incorrect password`;
    await currentField.fill(secret());
    await submit.click();
    await page.getByText('Contraseña actual incorrecta.', { exact: true }).waitFor();
    stage = `${label} correct password`;
    await currentField.fill(previous);
    await submit.click();
    await page.locator('#result').filter({ hasText: 'SAVED' }).waitFor();
    const verifier = createClient(url.href, key, { auth: { persistSession: false, autoRefreshToken: false } });
    ensure(!(await verifier.auth.signInWithPassword({ email, password: next })).error, `${label} new password login failed`);
    await verifier.auth.signOut({ scope: 'local' });
    await verifier.auth.dispose();
    await context.close();
    console.log(`${label}: lowercase validation, wrong-current denial, real password change and new login PASS`);
  }
} catch {
  // Playwright exceptions include action arguments. Never print their contents.
  console.error(`FAIL real local password UI flow: ${stage} (details withheld to protect credentials)`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  for (const server of servers) server.kill();
  for (const directory of paths) {
    if (!directory.href.startsWith(root.href) || !directory.pathname.endsWith('/.auth-security.local/')) throw new Error('Unexpected cleanup path');
    await rm(directory, { recursive: true, force: true });
  }
  for (const id of accounts) if ((await admin.auth.admin.deleteUser(id)).error) process.exitCode = 1;
  await admin.auth.dispose();
}
