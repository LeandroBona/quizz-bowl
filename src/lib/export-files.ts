export type ExportTable = { title: string; columns: string[]; rows: (string | number | null)[][] };

export function makeCsv(table: ExportTable) {
  const cell = (value: string | number | null) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return "\uFEFF" + [table.columns, ...table.rows].map(row => row.map(cell).join(";")).join("\r\n") + "\r\n";
}

function printable(value: string) {
  return value.normalize("NFC").replace(/[\u2010-\u2015]/g, "-").replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[^\x20-\xFF]/g, "?");
}
function pdfString(value: string) { return printable(value).replace(/[\\()]/g, "\\$&"); }
export function makePdf(table: ExportTable): Buffer {
  const objects: string[] = [];
  const put = (value: string) => { objects.push(value); return objects.length; };
  const catalog = put("");
  const pagesId = put("");
  const fontId = put("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const pageIds: number[] = [];
  const rows = [table.columns.join(" | "), ...table.rows.map(row => row.map(value => String(value ?? "").replace(/[\r\n]+/g, " ")).join(" | "))];
  const lines = rows.flatMap(row => { const result: string[] = []; for (let index = 0; index < row.length; index += 104) result.push(row.slice(index, index + 104)); return result.length ? result : [""]; });
  const perPage = 46;
  const chunks: string[][] = [];
  for (let index = 0; index < lines.length; index += perPage) chunks.push(lines.slice(index, index + perPage));
  if (!chunks.length) chunks.push([]);
  chunks.forEach((chunk, pageIndex) => {
    const content = [`BT /F1 15 Tf 40 795 Td (${pdfString(table.title)}) Tj ET`, `BT /F1 9 Tf 40 773 Td (Pagina ${pageIndex + 1} de ${chunks.length}) Tj ET`];
    chunk.forEach((line, index) => {
      content.push(`BT /F1 8 Tf 40 ${750 - index * 15} Td (${pdfString(line)}) Tj ET`);
    });
    const stream = content.join("\n");
    const streamId = put(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
    const pageId = put(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${streamId} 0 R >>`);
    pageIds.push(pageId);
  });
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  let document = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(document, "latin1")); document += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(document, "latin1");
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(offset => { document += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  document += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(document, "latin1");
}
