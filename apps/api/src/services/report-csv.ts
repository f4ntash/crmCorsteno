export function csvCell(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? '' : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function csvDocument(header: readonly string[], rows: readonly (readonly (string | number | null | undefined)[])[]) {
  return `\uFEFF${[header, ...rows].map((line) => line.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export function safeReportSlug(value: string) {
  const slug = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'experiencia';
}

export function reportFilename(label: string, suffix: string, date = new Date()) {
  return `corsteno-${safeReportSlug(label)}-${suffix}-${date.toISOString().slice(0, 10)}.csv`;
}
