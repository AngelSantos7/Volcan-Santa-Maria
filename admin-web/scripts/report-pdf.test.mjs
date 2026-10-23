import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporaryRoot = join(projectRoot, 'node_modules', '.tmp');
await mkdir(temporaryRoot, { recursive: true });
const outputDirectory = await mkdtemp(join(temporaryRoot, 'report-pdf-'));

const summary = {
  adults_count: 18,
  minors_count: 2,
  total_visitors: 20,
  visitors_registered: 20,
  entries_registered: 19,
  exits_registered: 17,
  currently_on_route: 2,
  ascents_total: 10,
  ascents_group: 4,
  ascents_individual: 6,
  ascents_started: 9,
  ascents_scheduled: 1,
  ascents_completed: 8,
  early_returns: 1,
  pending_returns: 1,
  administrative_returns: 1,
};

const baseReport = {
  generated_at: '2026-10-23T18:30:00.000Z',
  from: '2026-10-01T06:00:00.000Z',
  to: '2026-10-24T05:59:59.999Z',
  time_zone: 'America/Guatemala',
  summary,
  nationality_breakdown: [
    { nationality_country_code: 'GT', visitors: 16 },
    { nationality_country_code: 'MX', visitors: 4 },
  ],
  department_breakdown: [
    { department_code: 'quetzaltenango', visitors: 12 },
    { department_code: 'guatemala', visitors: 4 },
  ],
  route_breakdown: [
    { route_id: 'route-standard', route_name: 'Ruta estándar', ascents: 7 },
    { route_id: 'route-alternate', route_name: 'Ruta alterna', ascents: 3 },
  ],
};

function detailRow(index) {
  return {
    route_name: index % 2 === 0 ? 'Ruta estándar' : 'Ruta alterna',
    event_date: '2026-10-23T12:00:00.000Z',
    visitor_name: `Visitante sintético ${index + 1}`,
    nationality_country_code: index % 3 === 0 ? 'MX' : 'GT',
    join_code: `TEST-${String(index + 1).padStart(4, '0')}`,
    ascent_type: index % 2 === 0 ? 'individual' : 'group',
    started_at: '2026-10-23T12:15:00.000Z',
    expected_return_at: '2026-10-23T20:00:00.000Z',
    checked_out_at: index % 4 === 0 ? null : '2026-10-23T19:30:00.000Z',
    duration_minutes: index % 4 === 0 ? null : 435,
    operational_status: index % 4 === 0 ? 'on_route' : 'completed',
    creation_origin: index % 5 === 0 ? 'administrative' : 'tourist',
    completion_method: index % 4 === 0 ? 'pending' : 'normal',
  };
}

function verifyPdf(pdf, minimumPages) {
  const bytes = new Uint8Array(pdf.output('arraybuffer'));
  const signature = new TextDecoder('ascii').decode(bytes.subarray(0, 5));

  assert.equal(signature, '%PDF-', 'la salida debe tener una firma PDF válida');
  assert.ok(bytes.byteLength > 5_000, 'el reporte no debe quedar vacío');
  assert.ok(
    pdf.getNumberOfPages() >= minimumPages,
    `el reporte debe contener al menos ${minimumPages} página(s)`
  );
}

try {
  await build({
    root: projectRoot,
    configFile: false,
    logLevel: 'silent',
    build: {
      ssr: resolve(projectRoot, 'src/lib/report-pdf.ts'),
      outDir: outputDirectory,
      emptyOutDir: true,
      rollupOptions: {
        output: { entryFileNames: 'report-pdf.mjs' },
      },
    },
  });

  const { buildVisitorReportPdf } = await import(
    `${pathToFileURL(join(outputDirectory, 'report-pdf.mjs')).href}?test=${Date.now()}`
  );

  verifyPdf(
    buildVisitorReportPdf({ ...baseReport, report_type: 'summary', rows: [] }),
    1
  );
  verifyPdf(
    buildVisitorReportPdf({
      ...baseReport,
      report_type: 'detailed',
      rows: Array.from({ length: 80 }, (_, index) => detailRow(index)),
    }),
    2
  );

  console.log('PASS: reportes PDF resumido y detallado generados correctamente');
} finally {
  await rm(outputDirectory, { recursive: true, force: true });
}
