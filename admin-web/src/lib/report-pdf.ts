import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { VisitorReportData } from '../types';
import { countryName, departmentName } from './admin-form-utils';
import { adminLabel } from './admin-labels';

const DARK_GREEN: [number, number, number] = [20, 77, 58];
const MINT: [number, number, number] = [220, 243, 233];
const MUTED: [number, number, number] = [92, 105, 101];

function dateTime(value: string | null) {
  if (!value) return 'No disponible';
  return new Intl.DateTimeFormat('es-GT', {
    timeZone: 'America/Guatemala',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function duration(minutes: number | null) {
  if (minutes === null) return 'No disponible';
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function addHeader(pdf: jsPDF, title: string) {
  const width = pdf.internal.pageSize.getWidth();
  pdf.setFillColor(...DARK_GREEN);
  pdf.rect(0, 0, width, 28, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.text('ALCALDÍA INDÍGENA DE LLANOS DEL PINAL', 14, 11);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Gestor de Visitantes - Volcán Santa María', 14, 18);
  pdf.text(title, 14, 24);
}

function addFooters(pdf: jsPDF, generatedAt: string) {
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    pdf.setPage(page);
    const width = pdf.internal.pageSize.getWidth();
    const height = pdf.internal.pageSize.getHeight();
    pdf.setDrawColor(210, 218, 215);
    pdf.line(14, height - 12, width - 14, height - 12);
    pdf.setFontSize(8);
    pdf.setTextColor(...MUTED);
    pdf.text(`Emitido: ${dateTime(generatedAt)}`, 14, height - 7);
    pdf.text(`Página ${page} de ${pages}`, width - 14, height - 7, {
      align: 'right',
    });
  }
}

export function buildVisitorReportPdf(data: VisitorReportData) {
  const detailed = data.report_type === 'detailed';
  const pdf = new jsPDF({
    orientation: detailed ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  });
  addHeader(pdf, 'Reporte de control de visitantes');
  pdf.setTextColor(30, 40, 37);
  pdf.setFontSize(10);
  pdf.text(`Período: ${dateTime(data.from)} a ${dateTime(data.to)}`, 14, 36);
  pdf.text(
    `Tipo: ${detailed ? 'Reporte detallado' : 'Reporte resumido'} · Zona horaria: ${data.time_zone}`,
    14,
    42
  );

  const metrics = [
    ['Visitantes registrados', data.summary.visitors_registered],
    ['Ingresos registrados', data.summary.entries_registered],
    ['Egresos registrados', data.summary.exits_registered],
    ['Actualmente en recorrido', data.summary.currently_on_route],
    ['Ascensos iniciados', data.summary.ascents_started],
    ['Ascensos completados', data.summary.ascents_completed],
    ['Ascensos individuales', data.summary.ascents_individual],
    ['Ascensos grupales', data.summary.ascents_group],
    ['Retornos anticipados', data.summary.early_returns],
    ['Retornos administrativos', data.summary.administrative_returns],
    ['Retornos pendientes', data.summary.pending_returns],
  ];
  autoTable(pdf, {
    startY: 49,
    head: [['Indicador', 'Total']],
    body: metrics,
    theme: 'grid',
    headStyles: { fillColor: DARK_GREEN },
    alternateRowStyles: { fillColor: MINT },
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.5 },
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
    margin: { left: 14, right: 14, bottom: 18 },
  });
  let cursor =
    (pdf as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY ?? 110;
  const nationalities = data.nationality_breakdown.length
    ? data.nationality_breakdown.map((item) => [
        countryName(item.nationality_country_code),
        item.visitors,
      ])
    : [['No disponible', 'No disponible']];
  autoTable(pdf, {
    startY: cursor + 8,
    head: [['Nacionalidad', 'Visitantes con ingreso']],
    body: nationalities,
    theme: 'striped',
    headStyles: { fillColor: DARK_GREEN },
    styles: { font: 'helvetica', fontSize: 9 },
    margin: { left: 14, right: 14, bottom: 18 },
  });
  cursor =
    (pdf as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY ?? cursor;

  if (data.department_breakdown.length) {
    autoTable(pdf, {
      startY: cursor + 8,
      head: [['Departamento de Guatemala', 'Visitantes con ingreso']],
      body: data.department_breakdown.map((item) => [departmentName(item.department_code), item.visitors]),
      theme: 'striped',
      headStyles: { fillColor: DARK_GREEN },
      styles: { font: 'helvetica', fontSize: 9 },
      margin: { left: 14, right: 14, bottom: 18 },
    });
    cursor = (pdf as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? cursor;
  }

  if (detailed) {
    autoTable(pdf, {
      startY: cursor + 8,
      head: [
        [
          'Fecha',
          'Visitante',
          'Nacionalidad',
          'Código',
          'Tipo',
          'Ingreso',
          'Retorno estimado',
          'Egreso',
          'Duración',
          'Estado',
          'Origen',
          'Finalización',
        ],
      ],
      body: data.rows.map((row) => [
        dateTime(row.event_date),
        row.visitor_name,
        countryName(row.nationality_country_code),
        row.join_code,
        adminLabel(row.ascent_type),
        dateTime(row.started_at),
        dateTime(row.expected_return_at),
        dateTime(row.checked_out_at),
        duration(row.duration_minutes),
        adminLabel(row.operational_status),
        row.creation_origin === 'administrative'
          ? 'Creado por administración'
          : 'PWA',
        row.completion_method === 'administrative'
          ? 'Finalizado por administración'
          : row.completion_method === 'normal'
            ? 'Normal'
            : 'Pendiente',
      ]),
      theme: 'grid',
      headStyles: { fillColor: DARK_GREEN, fontSize: 6.5 },
      alternateRowStyles: { fillColor: MINT },
      styles: {
        font: 'helvetica',
        fontSize: 6.2,
        cellPadding: 1.4,
        overflow: 'linebreak',
        valign: 'middle',
      },
      rowPageBreak: 'avoid',
      showHead: 'everyPage',
      margin: { left: 8, right: 8, top: 34, bottom: 18 },
    });
    for (let page = 2; page <= pdf.getNumberOfPages(); page += 1) {
      pdf.setPage(page);
      addHeader(pdf, 'Reporte detallado de control de visitantes');
    }
  }
  addFooters(pdf, data.generated_at);
  return pdf;
}

export function saveVisitorReportPdf(
  data: VisitorReportData,
  fromDate: string,
  toDate: string
) {
  buildVisitorReportPdf(data).save(
    `Reporte_Visitantes_${fromDate}_${toDate}.pdf`
  );
}
