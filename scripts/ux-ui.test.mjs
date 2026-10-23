// Run the two Vite dev servers on loopback ports 5173/5174 first.
// Playwright is a temporary test tool; no production dependency is added.
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
const root = new URL('../', import.meta.url);
const paths = ['.ux-check.local/', 'admin-web/.ux-check.local/'];
const html = '<html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="./harness.tsx"></script></html>';
for (const path of paths) { await mkdir(new URL(path, root), { recursive: true }); await writeFile(new URL(`${path}index.html`, root), html); }
await mkdir(new URL('.ux-artifacts.local/', root), { recursive: true });
const rows = [
  { id: '11111111-1111-4111-8111-111111111111', slug: 'ascenso-a-la-cima', name_es: 'Cima del Volcán Santa María', name_en: 'Santa María summit', asset_prefix: 'santa-maria-route', journey_type: 'round_trip' },
  { id: '22222222-2222-4222-8222-222222222222', slug: 'mirador-picacho', name_es: 'Mirador Picacho', name_en: 'Mirador Picacho', asset_prefix: 'mirador-picacho-route', journey_type: 'one_way_return_same_path' },
];
const routeFixtures = await Promise.all(rows.map(async (row) => {
  const metadata = JSON.parse(await readFile(new URL(`public/data/${row.asset_prefix}-metadata.json`, root)));
  return { id: row.id, slug: row.slug, nameEs: row.name_es, nameEn: row.name_en, pathGeojson: JSON.parse(await readFile(new URL(`public/data/${row.asset_prefix}.geojson`, root))), distanceKm: metadata.distanceKm, totalDistanceKm: metadata.totalDistanceKm, estimatedDurationMinutes: metadata.durationMinutes, startCoordinate: metadata.start, summitCoordinate: metadata.summit, returnSamePath: row.slug === 'mirador-picacho', checkpoints: [], media: [] };
}));
await writeFile(new URL('.ux-check.local/harness.tsx', root), `
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import '../src/i18n'; import '../src/index.css'; import '../src/App.css';
import { GroupVisitScreen } from '../src/features/visits/GroupVisitScreen';
import { RouteMap } from '../src/features/routes/components/RouteMap';
import { RouteSelector } from '../src/features/routes/RouteSelector';
import { RegisterPage } from '../src/pages/RegisterPage';
import { AuthContext } from '../src/features/auth/auth-context';
const routes = ${JSON.stringify(routeFixtures)};
const mode = new URLSearchParams(location.search).get('mode');
function Harness() {
 const [selected, setSelected] = useState(''); const [index, setIndex] = useState(0);
 if (mode === 'register') return <AuthContext.Provider value={{signUp:async()=>({}),requestPasswordReset:async()=>{}}}><RegisterPage onShowLogin={()=>{}} onAccountCreated={()=>{}} onEmailConfirmationRequired={()=>{}}/></AuthContext.Provider>;
 if (mode === 'map') return <main style={{maxWidth:700,margin:'auto'}}><button onClick={() => setIndex(1-index)}>Cambiar fixture</button><RouteMap route={routes[index]} /></main>;
 if (mode === 'selector') return <RouteSelector value={selected} onChange={setSelected}/>;
 const details = {visitId:'fixture',routeId:routes[0].id,routeNameEs:routes[0].nameEs,routeNameEn:routes[0].nameEn,status:'in_progress',joinCode:'TEST',visitType:'day_hike',startMode:'now',hasLocalGuide:false,guideName:null,plannedStartAt:null,startedAt:new Date(Date.now()-4*60*60*1000+1500).toISOString(),expectedReturnAt:null,completedAt:null,createdBy:'person',participants:[{userId:'person',firstName:'Ana',lastName:'Prueba',memberRole:'leader',memberStatus:'active',joinedAt:new Date().toISOString(),avatarKind:'initials',avatarPath:null,avatarPreset:null,returnStartedAt:null,checkedOutAt:null}]};
 return <main style={{maxWidth:650,margin:'auto'}}><GroupVisitScreen currentUserId="person" details={details} loadError={null} onRefresh={async()=>{}} onVisitClosed={()=>{}} onOpenRoute={()=>{}}/></main>;
}
createRoot(document.getElementById('root')).render(<Harness/>);
`);
await writeFile(new URL('admin-web/.ux-check.local/harness.tsx', root), `
import { createRoot } from 'react-dom/client'; import { useState } from 'react';
import '../src/styles.css'; import { StaffPage } from '../src/pages/StaffPage';
import { AdminShell } from '../src/components/AdminShell'; import { AccountPassword } from '../src/components/AccountPassword';
function Harness() { const [password,setPassword]=useState(false); return password ? <AccountPassword close={()=>setPassword(false)} onSaved={async()=>{}}/> : <AdminShell session={{role:'admin',first_name:'Admin',last_name:'Volcán Santa María',email:'admin@example.invalid',permissions:{}}} page="staff" setPage={()=>{}} signOut={()=>{}} changePassword={()=>setPassword(true)}><StaffPage/></AdminShell>; }
createRoot(document.getElementById('root')).render(<Harness/>);
`);
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-GT', serviceWorkers: 'block' });
const mutations = [];
await context.route('**/*', async (route) => {
  const request = route.request(); const url = new URL(request.url());
  if (url.pathname.includes('/auth/v1/')) { mutations.push({ path: url.pathname }); return route.fulfill({ json: {} }); }
  if (url.pathname.includes('/functions/v1/')) { mutations.push({ path: url.pathname, body: request.postDataJSON() }); return route.fulfill({ json: { user_id: 'fixture' } }); }
  if (url.pathname.includes('/rest/v1/')) {
    if (url.pathname.endsWith('/routes')) {
      const id = url.searchParams.get('id')?.replace('eq.', '');
      const slug = url.searchParams.get('slug')?.replace('eq.', '');
      return route.fulfill({ json: id || slug ? rows.find((row) => row.id === id || row.slug === slug) : rows });
    }
    return route.fulfill({ json: [] });
  }
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
    if (url.pathname.endsWith('style.json') || url.pathname.endsWith('/liberty')) return route.fulfill({ json: { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e3ece6' } }] } });
    return route.abort();
  }
  return route.continue();
});
let passed = 0;
async function check(name, run) { await run(); passed++; console.log(`PASS UI: ${name}`); }
const page = await context.newPage();
const screenshot = (name) => page.screenshot({ path: new URL(`.ux-artifacts.local/${name}.png`, root).pathname.replace(/^\/(.:)/, '$1'), fullPage: true });
try {
  await check('Admin login: eye toggles twice, recovery remains secondary and sends through existing flow', async () => {
    await page.goto('http://127.0.0.1:5174/');
    const password = page.locator('#password'); await password.waitFor();
    assert.equal(await password.getAttribute('type'), 'password');
    await page.getByRole('button', { name: 'Mostrar contraseña', exact: true }).click();
    assert.equal(await password.getAttribute('type'), 'text');
    await page.getByRole('button', { name: 'Ocultar contraseña', exact: true }).click();
    assert.equal(await password.getAttribute('type'), 'password');
    for (const width of [1280, 768, 375]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const input = await password.boundingBox(); const eye = await page.locator('.password-eye').boundingBox();
      assert.ok(eye.x >= input.x && eye.x + eye.width <= input.x + input.width + 1);
      await screenshot(`login-${width}`);
    }
    await page.getByRole('button', { name: '¿Olvidó su contraseña?' }).click();
    await page.getByLabel('Correo electrónico').fill('test@example.invalid');
    await page.getByRole('button', { name: 'Enviar enlace seguro' }).click();
    await page.getByRole('status').filter({ hasText: 'Si existe una cuenta' }).waitFor();
    assert.ok(mutations.some((item) => item.path.endsWith('/recover')));
  });
  await check('Staff responsive form, separate names, +502 and invitation payload', async () => {
    await page.goto('http://127.0.0.1:5174/.ux-check.local/index.html');
    await page.getByRole('button', { name: '+ Nuevo gestor' }).click();
    for (const width of [1280, 768, 375]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const boxes = await page.locator('.staff-invitation-form .form-grid input').evaluateAll((inputs) => inputs.map((input) => { const r = input.getBoundingClientRect(); return { x:r.x,y:r.y,w:r.width,h:r.height }; }));
      assert.ok(boxes.every((box) => box.w > 40 && box.h >= 44 && box.x + box.w <= width));
      await screenshot(`staff-${width}`);
    }
    await page.getByLabel('Nombre', { exact: true }).fill('Ana María');
    await page.getByLabel('Apellido', { exact: true }).fill('López Pérez');
    await page.getByLabel('Correo electrónico').fill('staff@example.invalid');
    await page.locator('#staff-phone').fill('55551234');
    await page.getByLabel('Crear ascensos', { exact: true }).check();
    await page.getByRole('button', { name: 'Enviar invitación', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Invitación enviada' }).waitFor();
    const sent = mutations.find((item) => item.path.endsWith('/invite-staff')).body;
    assert.equal(sent.firstName, 'Ana María'); assert.equal(sent.lastName, 'López Pérez'); assert.equal(sent.phone, '+50255551234');
    assert.equal(sent.permissions.can_manage_visits, true); assert.equal('dateOfBirth' in sent, false);
    await page.locator('.sidebar-account summary').click();
    await page.getByRole('button', { name: 'Cambiar contraseña', exact: true }).click();
    await page.getByRole('heading', { name: 'Cambiar contraseña' }).waitFor();
    await page.getByLabel('Nueva contraseña', { exact: true }).fill('volcan25');
    assert.ok((await page.locator('.password-rules').innerText()).includes('○ Incluye una letra mayúscula'));
    await page.getByLabel('Nueva contraseña', { exact: true }).fill('Volcan25');
    assert.ok((await page.locator('.password-rules').innerText()).includes('✓ Incluye una letra mayúscula'));
  });
  await check('Finish is visible/disabled, early return occurs once, and unlock timer works', async () => {
    await page.clock.install({ time: new Date('2026-10-22T18:00:00Z') });
    await page.goto('http://127.0.0.1:5173/.ux-check.local/index.html?mode=visit');
    const finish = page.getByRole('button', { name: 'Finalizar ascenso', exact: true }); await finish.waitFor();
    assert.equal(await finish.isDisabled(), true);
    await page.getByText('Podrá finalizar normalmente a partir de las', { exact: false }).waitFor();
    await page.locator('.ascent-options summary').click();
    assert.equal(await page.getByRole('button', { name: 'Registrar retorno anticipado', exact: true }).count(), 1);
    await screenshot('return-before');
    await page.clock.runFor(2000);
    assert.equal(await finish.isEnabled(), true);
    await screenshot('return-after');
  });
  await check('Route selector initially empty and alternative stays selectable', async () => {
    await page.goto('http://127.0.0.1:5173/.ux-check.local/index.html?mode=selector');
    await page.locator('.route-option').first().waitFor();
    assert.equal(await page.locator('input[type=radio]:checked').count(), 0);
    await page.getByRole('radio').nth(0).check();
    assert.equal(await page.getByRole('radio').nth(1).isEnabled(), true);
    await page.getByRole('radio').nth(1).check();
    assert.equal(await page.locator('input[type=radio]:checked').count(), 1);
  });
  await check('Tourist registration starts with name, surname, birth date and live uppercase rule', async () => {
    await page.goto('http://127.0.0.1:5173/.ux-check.local/index.html?mode=register');
    await page.locator('input[name=firstName]').waitFor();
    const names = await page.locator('form input').evaluateAll((inputs) => inputs.slice(0,3).map((input) => input.name));
    assert.deepEqual(names, ['firstName', 'lastName', 'dateOfBirth']);
    assert.ok(await page.locator('input[name=dateOfBirth]').getAttribute('max'));
    await page.locator('input[name=password]').fill('volcan25');
    assert.ok((await page.locator('.password-rules').innerText()).includes('○ Incluye una letra mayúscula'));
    await page.locator('input[name=password]').fill('Volcan25');
    assert.ok((await page.locator('.password-rules').innerText()).includes('✓ Incluye una letra mayúscula'));
    await screenshot('registration');
  });
  await check('Both map routes, active badge, legend, viewport and route switching', async () => {
    // New page resets the test clock so MapLibre requestAnimationFrame runs normally.
    await page.clock.resume(); await page.setViewportSize({ width: 390, height: 900 });
    await page.goto('http://127.0.0.1:5173/.ux-check.local/index.html?mode=map');
    await page.locator('.route-map-legend li').nth(1).waitFor({ timeout: 30000 });
    assert.equal(await page.locator('.route-map-active-badge strong').innerText(), 'Ruta Cima Volcán Santa María');
    const key = await page.locator('.route-map-route-key').boundingBox(); const switcher = await page.locator('.route-map-basemap-switcher').boundingBox();
    assert.ok(key.y + key.height <= switcher.y, 'selected destination does not overlap map controls');
    await page.waitForTimeout(1200); await screenshot('map-cima');
    const frame = await page.locator('.route-map-frame').boundingBox();
    const start = await page.locator('.route-start-marker').boundingBox();
    const summit = await page.locator('.route-destination-marker.summit').boundingBox();
    assert.ok(start.y > frame.y && start.y + start.height < frame.y + frame.height, 'route start fits initial viewport');
    assert.ok(summit.y > frame.y && summit.y + summit.height < frame.y + frame.height, 'destination fits initial viewport');
    await page.getByRole('button', { name: 'Cambiar fixture' }).click();
    assert.equal(await page.locator('.route-map-active-badge strong').innerText(), 'Ruta Mirador Picacho');
    assert.equal(await page.locator('.route-map-legend li').count(), 2);
    await page.waitForTimeout(700); await screenshot('map-picacho');
    for (const width of [320, 360, 390, 430, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 }); await page.waitForTimeout(250);
      for (const destination of ['cima', 'picacho']) {
      await page.getByRole('button', { name: 'Cambiar fixture' }).click(); await page.waitForTimeout(200);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no overflow at ${width}`);
      assert.equal(await page.locator('.route-destination-marker').count(), 2);
      assert.equal(await page.locator('.route-destination-marker.active').count(), 1);
      const bounds = await page.locator('.route-map-frame').boundingBox();
      for (const marker of await page.locator('.route-destination-marker').all()) {
        const box = await marker.boundingBox();
        assert.ok(box.x >= bounds.x && box.x + box.width <= bounds.x + bounds.width + 1, `full destination label fits ${width}`);
        assert.ok(box.y >= bounds.y && box.y + box.height <= bounds.y + bounds.height, `destination vertically fits ${width}`);
      }
      await screenshot(`map-responsive-${destination}-${width}`);
      }
    }
    await page.getByRole('button', { name: 'Mapa', exact: true }).click();
    await page.waitForTimeout(500);
    assert.equal(await page.locator('.route-map-legend li').count(), 2);
    await page.evaluate(async () => {
      document.documentElement.dataset.theme = 'light';
      const { default: i18n } = await import('/src/i18n.ts');
      await i18n.changeLanguage('en');
    });
    assert.equal(await page.locator('.route-map-active-badge strong').innerText(), 'Mirador Picacho route');
    await screenshot('map-light-en');
  });
  console.log(`UI checks passed: ${passed}`);
} catch (error) {
  await screenshot('failure');
  throw error;
} finally {
  await browser.close();
  // Only remove the two fixed, generated fixture directories inside this project.
  for (const path of paths) {
    const target = new URL(path, root);
    assert.ok(target.href.startsWith(root.href) && target.href.endsWith('/.ux-check.local/'));
    await rm(target, { recursive: true, force: true });
  }
}
