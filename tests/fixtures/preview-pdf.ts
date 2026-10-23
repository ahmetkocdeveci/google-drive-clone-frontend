/** Two pages with distinct pixels, no external resources or fonts. */
export function createPreviewPdf(): Uint8Array {
  const commands = ['1 0 0 rg 0 0 60 80 re f', '0 0 1 rg 0 0 60 80 re f']
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 60 80] /Resources << >> /Contents 4 0 R >>',
    `<< /Length ${commands[0]!.length} >>\nstream\n${commands[0]}\nendstream`,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 60 80] /Resources << >> /Contents 6 0 R >>',
    `<< /Length ${commands[1]!.length} >>\nstream\n${commands[1]}\nendstream`,
  ]
  let text = '%PDF-1.4\n'
  const offsets = [0]
  for (const [index, object] of objects.entries()) { offsets.push(text.length); text += `${index + 1} 0 obj\n${object}\nendobj\n` }
  const xref = text.length
  text += `xref\n0 7\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(text)
}
