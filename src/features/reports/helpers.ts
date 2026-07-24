export function toPhp(value: number): string {
  return `₱${Math.round(value).toLocaleString('en-PH')}`;
}

export function csvEscape(value: string | number): string {
  const text = String(value);
  const escaped = text.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function downloadTextFile(fileName: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'project';
}
