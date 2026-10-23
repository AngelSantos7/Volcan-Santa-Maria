// Uses real components and Supabase SDK with intercepted HTTP. No real accounts.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE_PATH
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href
    : 'playwright'
);
const root = new URL('../', import.meta.url);
const paths = ['.final-check.local/', 'admin-web/.final-check.local/'];
const html =
  '<html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="./harness.tsx"></script></html>';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const jwt = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' })).toString('base64url')}.synthetic-test-signature`;
const rows = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'ascenso-a-la-cima',
    name_es: 'Cima del Volcán Santa María',
    name_en: 'Santa María summit',
    asset_prefix: 'santa-maria-route',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    slug: 'mirador-picacho',
    name_es: 'Mirador Picacho',
    name_en: 'Mirador Picacho',
    asset_prefix: 'mirador-picacho-route',
  },
];
const content = await Promise.all(
  rows.map(async (row) => {
    const data = JSON.parse(
      await readFile(
        new URL(`public/data/${row.asset_prefix}-metadata.json`, root)
      )
    );
    return {
      ...row,
      nameEs: row.name_es,
      nameEn: row.name_en,
      pathGeojson: JSON.parse(
        await readFile(new URL(`public/data/${row.asset_prefix}.geojson`, root))
      ),
      distanceKm: data.distanceKm,
      totalDistanceKm: data.totalDistanceKm,
      estimatedDurationMinutes: data.durationMinutes,
      startCoordinate: data.start,
      summitCoordinate: data.summit,
      checkpoints: [],
      media: [],
      returnSamePath: row.slug === 'mirador-picacho',
    };
  })
);
for (const path of paths) {
  await mkdir(new URL(path, root), { recursive: true });
  await writeFile(new URL(`${path}index.html`, root), html);
}
await writeFile(
  new URL('.final-check.local/harness.tsx', root),
  `
import { createRoot } from 'react-dom/client'; import { useState } from 'react';
import '../src/i18n'; import '../src/index.css'; import '../src/App.css';
import { AuthProvider } from '../src/features/auth/AuthProvider';
import { PasswordRecoveryPage } from '../src/pages/PasswordRecoveryPage';
import { supabase } from '../src/lib/supabase';
import { GroupVisitScreen } from '../src/features/visits/GroupVisitScreen';
import { ChangeRouteDialog } from '../src/features/routes/ChangeRouteDialog';
import { RouteMap } from '../src/features/routes/components/RouteMap';
const mode = new URLSearchParams(location.search).get('mode');
if (mode === 'password' || mode === 'recovery') await supabase.auth.setSession({access_token:${JSON.stringify(jwt)},refresh_token:'fixture-refresh-token'});
const routes = ${JSON.stringify(content)};
function Harness() {
 const [saved,setSaved]=useState(false); const [started,setStarted]=useState(mode==='active-route');
 const [person,setPerson]=useState('member'); const [index,setIndex]=useState(0); const [dialog,setDialog]=useState(false);
 if (saved) return <p>Guardado</p>;
 if (mode==='password' || mode==='recovery') return <AuthProvider><PasswordRecoveryPage changing={mode==='password'} onPasswordUpdated={()=>setSaved(true)}/></AuthProvider>;
 if (mode?.includes('route')) return <main style={{maxWidth:700,margin:'auto'}}><RouteMap route={routes[index]} onChangeRoute={()=>setDialog(true)}/>
   {dialog && <ChangeRouteDialog visitId="fixture" routeId={routes[index].id} started={started} onClose={()=>setDialog(false)} onChanged={async()=>setIndex(1-index)}/>}</main>;
 const participant=(userId,firstName,memberRole)=>({userId,firstName,lastName:'Prueba',memberRole,memberStatus:'active',joinedAt:new Date().toISOString(),avatarKind:'initials',avatarPath:null,avatarPreset:null,returnStartedAt:null,checkedOutAt:null});
 const details={visitId:'fixture',routeId:routes[0].id,routeNameEs:routes[0].nameEs,routeNameEn:routes[0].nameEn,status:started?'in_progress':'forming',joinCode:'TEST',visitType:'day_hike',startMode:'now',hasLocalGuide:false,guideName:null,plannedStartAt:null,startedAt:started?new Date().toISOString():null,expectedReturnAt:null,completedAt:null,createdBy:'leader',participants:[participant('leader','Miguel','leader'),participant('member','Mario','member')]};
 return <main style={{maxWidth:650,margin:'auto'}}><button onClick={()=>setStarted(true)}>Iniciar fixture</button><button onClick={()=>setPerson(person==='member'?'leader':'member')}>Cambiar adulto fixture</button>
 <GroupVisitScreen currentUserId={person} details={details} loadError={null} onRefresh={async()=>{}} onVisitClosed={()=>{}} onOpenRoute={()=>{}}/></main>;
}
createRoot(document.getElementById('root')).render(<Harness/>);
`
);
await writeFile(
  new URL('admin-web/.final-check.local/harness.tsx', root),
  `
import { createRoot } from 'react-dom/client'; import { useState } from 'react'; import '../src/styles.css';
import App from '../src/App';
import { AccountPassword } from '../src/components/AccountPassword'; import { ChangeRouteControl } from '../src/components/ChangeRouteControl';
import { supabase } from '../src/lib/supabase';
const mode=new URLSearchParams(location.search).get('mode');
if(mode!=='app-recovery') await supabase.auth.setSession({access_token:${JSON.stringify(jwt)},refresh_token:'fixture-refresh-token'});
function Harness(){const [saved,setSaved]=useState(false);if(mode?.startsWith('app-')) return <App/>;return saved?<p>Guardado</p>:mode==='route'?<ChangeRouteControl visitId="fixture" routeId="${rows[0].id}" started onChanged={()=>setSaved(true)}/>:<AccountPassword recovery={mode==='recovery'} invitation={mode==='invitation'} onSaved={async()=>setSaved(true)}/>;}
createRoot(document.getElementById('root')).render(<Harness/>);
`
);
const browser = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: 'es-GT',
  serviceWorkers: 'block',
});
const calls = [];
let authRole = 'tourist';
const minors = [
  {
    id: 'minor1',
    full_name: 'María',
    age: 16,
    sex: 'female',
    relationship: 'cousin',
    responsible_member_id: 'leader',
    responsible_name: 'Miguel Prueba',
    operational_status: 'active',
  },
  {
    id: 'minor2',
    full_name: 'José',
    age: 16,
    sex: 'male',
    relationship: 'grandchild',
    responsible_member_id: 'leader',
    responsible_name: 'Miguel Prueba',
    operational_status: 'active',
  },
];
await context.route('**/*', async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  if (url.pathname.includes('/auth/v1/')) {
    const user = {
      id,
      email: 'fixture@example.invalid',
      aud: 'authenticated',
      role: 'authenticated',
      app_metadata: { provider: 'email', role: authRole },
      user_metadata: {},
      created_at: new Date().toISOString(),
    };
    calls.push({ path: url.pathname, method: request.method() }); // Never record credentials.
    if (url.pathname.endsWith('/token')) {
      if (request.postDataJSON()?.password === 'Incorrect-test-9')
        return route.fulfill({
          status: 400,
          json: {
            error_code: 'invalid_credentials',
            msg: 'Invalid login credentials',
          },
        });
      return route.fulfill({
        json: {
          access_token: jwt,
          refresh_token: 'temporary-fixture-refresh',
          expires_in: 3600,
          token_type: 'bearer',
          user,
        },
      });
    }
    if (url.pathname.endsWith('/logout')) return route.fulfill({ status: 204 });
    return route.fulfill({ json: user });
  }
  if (url.pathname.includes('/rest/v1/')) {
    if (url.pathname.endsWith('/routes')) {
      const id = url.searchParams.get('id')?.replace('eq.', '');
      const slug = url.searchParams.get('slug')?.replace('eq.', '');
      return route.fulfill({
        json:
          id || slug ? rows.find((r) => r.id === id || r.slug === slug) : rows,
      });
    }
    if (url.pathname.endsWith('/get_admin_session'))
      return route.fulfill({
        json: {
          user_id: id,
          email: 'fixture@example.invalid',
          first_name: 'Admin',
          last_name: 'Prueba',
          role: 'visitor_manager',
          is_active: true,
          invitation_status: 'active',
          permissions: {},
        },
      });
    if (url.pathname.endsWith('/get_visit_minors'))
      return route.fulfill({ json: minors });
    if (url.pathname.endsWith('/add_my_visit_minors')) {
      const body = request.postDataJSON();
      calls.push({ path: url.pathname, body });
      minors.push(
        ...body.p_minors.map((m, i) => ({
          ...m,
          id: 'added' + i,
          responsible_member_id: 'member',
          responsible_name: 'Mario Prueba',
          operational_status: 'active',
        }))
      );
    }
    if (url.pathname.endsWith('/change_visit_route'))
      calls.push({ path: url.pathname, body: request.postDataJSON() });
    return route.fulfill({ json: [] });
  }
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
    if (
      url.pathname.endsWith('style.json') ||
      url.pathname.endsWith('/liberty')
    )
      return route.fulfill({
        json: {
          version: 8,
          sources: {},
          layers: [
            {
              id: 'background',
              type: 'background',
              paint: { 'background-color': '#e3ece6' },
            },
          ],
        },
      });
    return route.abort();
  }
  return route.continue();
});
await mkdir(new URL('.ux-artifacts.local/', root), { recursive: true });
const page = await context.newPage();
const screenshot = (name) =>
  page.screenshot({
    path: new URL(`.ux-artifacts.local/${name}.png`, root).pathname.replace(
      /^\/(.:)/,
      '$1'
    ),
    fullPage: true,
  });
page.setDefaultTimeout(15000);
const updates = () =>
  calls.filter((c) => c.path.endsWith('/user') && c.method === 'PUT').length;
const routeChanges = () =>
  calls.filter((c) => c.path.endsWith('/change_visit_route'));
let passed = 0;
async function check(name, run) {
  await run();
  passed++;
  console.log(`PASS FINAL UI: ${name}`);
}
try {
  for (const role of ['tourist', 'admin', 'visitor_manager'])
    await check(
      `${role}: wrong/current/new password, eyes and session preservation`,
      async () => {
        authRole = role;
        const port = role === 'tourist' ? 5173 : 5174;
        await page.goto(
          `http://127.0.0.1:${port}/.final-check.local/index.html?mode=password`
        );
        await page.getByLabel('Contraseña actual', { exact: true }).waitFor();
        await screenshot(`password-${role}`);
        const storage = await page.evaluate(() => JSON.stringify(localStorage));
        const initial = updates();
        await page
          .getByLabel('Contraseña actual', { exact: true })
          .fill('Incorrect-test-9');
        await page
          .getByLabel('Nueva contraseña', { exact: true })
          .fill('New-test-value-9');
        await page
          .getByLabel('Confirmar nueva contraseña', { exact: true })
          .fill('New-test-value-9');
        const submit = page.getByRole('button', {
          name:
            role === 'tourist' ? 'Actualizar contraseña' : 'Guardar contraseña',
          exact: true,
        });
        await submit.click();
        await page
          .getByText('Contraseña actual incorrecta.', { exact: true })
          .waitFor();
        assert.equal(updates(), initial);
        await page
          .getByLabel('Contraseña actual', { exact: true })
          .fill('Current-test-value-9');
        await page
          .getByLabel('Nueva contraseña', { exact: true })
          .fill('lowercase9');
        await page
          .getByLabel('Confirmar nueva contraseña', { exact: true })
          .fill('lowercase9');
        await submit.click();
        assert.equal(updates(), initial);
        await page
          .getByLabel('Nueva contraseña', { exact: true })
          .fill('New-test-value-9');
        await page
          .getByLabel('Confirmar nueva contraseña', { exact: true })
          .fill('New-test-value-9');
        await page
          .getByRole('button', { name: 'Mostrar contraseña', exact: true })
          .first()
          .click();
        assert.equal(
          await page
            .getByLabel('Contraseña actual', { exact: true })
            .getAttribute('type'),
          'text'
        );
        await page
          .getByRole('button', { name: 'Ocultar contraseña', exact: true })
          .first()
          .click();
        await submit.click();
        await page.getByText('Guardado', { exact: true }).waitFor();
        assert.equal(updates(), initial + 1);
        assert.equal(
          await page.evaluate(() => JSON.stringify(localStorage)),
          storage,
          'main session and stored role unchanged'
        );
      }
    );
  await check(
    'Recovery and first invitation do not require an unavailable current password',
    async () => {
      for (const [port, mode] of [
        [5173, 'recovery'],
        [5174, 'recovery'],
        [5174, 'invitation'],
      ]) {
        await page.goto(
          `http://127.0.0.1:${port}/.final-check.local/index.html?mode=${mode}`
        );
        await page.getByLabel('Nueva contraseña', { exact: true }).waitFor();
        assert.equal(
          await page.getByLabel('Contraseña actual', { exact: true }).count(),
          0
        );
      }
    }
  );
  await check(
    'A recovery query alone cannot bypass current password; a verified Auth recovery link can',
    async () => {
      await page.goto(
        'http://127.0.0.1:5174/.final-check.local/index.html?mode=app-query&auth=recovery'
      );
      await page.locator('.sidebar-account summary').waitFor();
      assert.equal(
        await page.getByLabel('Nueva contraseña', { exact: true }).count(),
        0
      );
      await page.locator('.sidebar-account summary').click();
      await page
        .getByRole('button', { name: 'Cambiar contraseña', exact: true })
        .click();
      await page.getByLabel('Contraseña actual', { exact: true }).waitFor();
      await page.goto(
        `http://127.0.0.1:5174/.final-check.local/index.html?mode=app-recovery&auth=recovery#access_token=${jwt}&refresh_token=fixture-recovery-refresh&expires_in=3600&token_type=bearer&type=recovery`
      );
      await page.getByLabel('Nueva contraseña', { exact: true }).waitFor();
      assert.equal(
        await page.getByLabel('Contraseña actual', { exact: true }).count(),
        0
      );
    }
  );
  await check(
    'Member adds own minor; hierarchy and lock for both adults after start',
    async () => {
      await page.goto(
        'http://127.0.0.1:5173/.final-check.local/index.html?mode=minors'
      );
      await page.getByText('María', { exact: true }).waitFor();
      const miguel = page
        .locator('.participants-list > li')
        .filter({ has: page.getByText('Miguel Prueba', { exact: true }) });
      assert.equal(await miguel.locator('.adult-minors li').count(), 2);
      await page
        .getByRole('button', {
          name: 'Agregar menores a mi cargo',
          exact: true,
        })
        .click();
      await page.locator('.minor-card input').nth(0).fill('Carlos');
      await page.locator('.minor-card input[type=number]').fill('12');
      await page.locator('.minor-card select').nth(1).selectOption('child');
      await page.locator('.minor-consent-row input').check();
      await page
        .getByRole('button', { name: 'Guardar menores a mi cargo' })
        .click();
      await page.getByText('Carlos', { exact: true }).waitFor();
      const mario = page
        .locator('.participants-list > li')
        .filter({ has: page.getByText('Mario Prueba', { exact: true }) });
      assert.equal(await mario.locator('.adult-minors li').count(), 1);
      assert.equal(
        await miguel.locator('.adult-minors button').count(),
        0,
        'member cannot remove leader minors'
      );
      assert.equal(await mario.locator('.adult-minors button').count(), 1);
      await screenshot('minors-by-adult');
      await page.getByRole('button', { name: 'Iniciar fixture' }).click();
      await page
        .getByText(
          'Los menores acompañantes solo pueden registrarse antes de iniciar el ascenso.',
          { exact: true }
        )
        .waitFor();
      assert.equal(
        await page
          .getByRole('button', {
            name: 'Agregar menores a mi cargo',
            exact: true,
          })
          .count(),
        0
      );
      assert.equal(await page.locator('.adult-minors button').count(), 0);
      await page
        .getByRole('button', { name: 'Cambiar adulto fixture' })
        .click();
      assert.equal(
        await page
          .getByRole('button', {
            name: 'Agregar menores a mi cargo',
            exact: true,
          })
          .count(),
        0
      );
      assert.equal(await page.locator('.adult-minors li').count(), 3);
      await page
        .getByRole('button', { name: 'Recomendaciones', exact: true })
        .waitFor();
    }
  );
  for (const active of [false, true])
    await check(
      `Map route changes both directions ${active ? 'during hike' : 'before start'}`,
      async () => {
        await page.goto(
          `http://127.0.0.1:5173/.final-check.local/index.html?mode=${active ? 'active-route' : 'forming-route'}`
        );
        for (const index of [1, 0]) {
          const before = routeChanges().length;
          await page
            .getByRole('button', { name: 'Cambiar ruta', exact: true })
            .click();
          const dialog = page.getByRole('dialog');
          await dialog.getByRole('radio').nth(index).check();
          await dialog
            .getByRole('button', { name: 'Cambiar ruta', exact: true })
            .click();
          assert.equal(routeChanges().length, before);
          if (active) {
            await dialog
              .getByText('No existe una ruta directa', { exact: false })
              .waitFor();
            await screenshot('active-route-warning');
            await dialog.getByRole('button', { name: 'Entendido' }).click();
            assert.equal(
              await dialog
                .getByRole('button', { name: 'Cambiar ruta', exact: true })
                .isDisabled(),
              true
            );
            await dialog.getByRole('checkbox').check();
          }
          await dialog
            .getByRole('button', { name: 'Cambiar ruta', exact: true })
            .click();
          await dialog.waitFor({ state: 'hidden' });
          assert.equal(routeChanges().length, before + 1);
          assert.equal(routeChanges().at(-1).body.p_returned_to_start, active);
          assert.equal(routeChanges().at(-1).body.p_route_id, rows[index].id);
          await page
            .locator('.route-map-active-badge strong')
            .filter({
              hasText: index
                ? 'Ruta Mirador Picacho'
                : 'Ruta Cima Volcán Santa María',
            })
            .waitFor();
        }
      }
    );
  await check(
    'Administrative active route change requires warning and physical-return confirmation',
    async () => {
      await page.goto(
        'http://127.0.0.1:5174/.final-check.local/index.html?mode=route'
      );
      await page.locator('select option').nth(1).waitFor({ state: 'attached' });
      await page.locator('select').selectOption(rows[1].id);
      const before = routeChanges().length;
      await page
        .getByRole('button', { name: 'Cambiar ruta', exact: true })
        .click();
      await page.getByRole('button', { name: 'Entendido' }).click();
      assert.equal(
        await page
          .getByRole('button', { name: 'Cambiar ruta', exact: true })
          .isDisabled(),
        true
      );
      assert.equal(routeChanges().length, before);
      await page.getByRole('checkbox').check();
      await page
        .getByRole('button', { name: 'Cambiar ruta', exact: true })
        .click();
      await page.getByText('Guardado', { exact: true }).waitFor();
      assert.equal(routeChanges().at(-1).body.p_returned_to_start, true);
    }
  );
  console.log(`Final flow checks passed: ${passed}`);
} finally {
  await browser.close();
  for (const path of paths) {
    const target = new URL(path, root);
    assert.ok(
      target.href.startsWith(root.href) &&
        target.href.endsWith('/.final-check.local/')
    );
    await rm(target, { recursive: true, force: true });
  }
}
