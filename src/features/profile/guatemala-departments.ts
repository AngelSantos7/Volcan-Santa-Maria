export const GUATEMALA_DEPARTMENTS = [
  ['alta_verapaz', 'Alta Verapaz'],
  ['baja_verapaz', 'Baja Verapaz'],
  ['chimaltenango', 'Chimaltenango'],
  ['chiquimula', 'Chiquimula'],
  ['el_progreso', 'El Progreso'],
  ['escuintla', 'Escuintla'],
  ['guatemala', 'Guatemala'],
  ['huehuetenango', 'Huehuetenango'],
  ['izabal', 'Izabal'],
  ['jalapa', 'Jalapa'],
  ['jutiapa', 'Jutiapa'],
  ['peten', 'Petén'],
  ['quetzaltenango', 'Quetzaltenango'],
  ['quiche', 'Quiché'],
  ['retalhuleu', 'Retalhuleu'],
  ['sacatepequez', 'Sacatepéquez'],
  ['san_marcos', 'San Marcos'],
  ['santa_rosa', 'Santa Rosa'],
  ['solola', 'Sololá'],
  ['suchitepequez', 'Suchitepéquez'],
  ['totonicapan', 'Totonicapán'],
  ['zacapa', 'Zacapa'],
] as const;

export type GuatemalaDepartmentCode =
  (typeof GUATEMALA_DEPARTMENTS)[number][0];

export function isGuatemalaDepartmentCode(
  value: string
): value is GuatemalaDepartmentCode {
  return GUATEMALA_DEPARTMENTS.some(([code]) => code === value);
}

export function guatemalaDepartmentName(value: string | null): string | null {
  return GUATEMALA_DEPARTMENTS.find(([code]) => code === value)?.[1] ?? null;
}
