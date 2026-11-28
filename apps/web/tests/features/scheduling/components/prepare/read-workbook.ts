import { strFromU8, unzipSync } from 'fflate';

/** One cell as a spreadsheet shows it: dates read as dd/mm/aaaa. */
export interface ReadCell {
  value: string | number;
  /** The date format, when the cell is a real date. */
  dateFormat?: string;
  bold: boolean;
  /** `#rrggbb`, lower case; undefined for the theme's text color. */
  textColor?: string;
  /** `#rrggbb`, lower case; undefined without a fill. */
  fill?: string;
  wrap: boolean;
}

export interface ReadSheet {
  name: string;
  /** Row by row from row 1; a missing cell is null. */
  rows: (ReadCell | null)[][];
  /** Rows kept in view while scrolling. */
  frozenRows: number;
  /** The filter buttons' range, e.g. `A4:G11`. */
  autoFilter?: string;
  /** The hidden filter range Excel and LibreOffice look up, per sheet. */
  filterDatabase?: string;
  /** Column widths in characters, by column. */
  widths: number[];
}

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

function parse(files: Record<string, Uint8Array>, path: string): Document {
  const bytes = files[path];
  if (!bytes) throw new Error(`${path} is missing from the workbook`);
  return new DOMParser().parseFromString(strFromU8(bytes), 'application/xml');
}

function all(node: Document | Element, tag: string): Element[] {
  return Array.from(node.getElementsByTagNameNS(MAIN, tag));
}

function color(element: Element | undefined): string | undefined {
  const rgb = element?.getAttribute('rgb');
  return rgb ? `#${rgb.slice(2).toLowerCase()}` : undefined;
}

/** `A1` → its 0-based column. */
function columnIndex(reference: string): number {
  const letters = reference.replace(/\d+/g, '');
  return (
    [...letters].reduce(
      (sum, letter) => sum * 26 + letter.charCodeAt(0) - 64,
      0,
    ) - 1
  );
}

/** Excel's day serial (1900 system) as dd/mm/yyyy. */
function serialDay(serial: number): string {
  const date = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
}

/** Reads an .xlsx back: sheets in order, their cells, styles and views. */
export async function readWorkbook(blob: Blob): Promise<ReadSheet[]> {
  const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const strings = files['xl/sharedStrings.xml']
    ? all(parse(files, 'xl/sharedStrings.xml'), 'si').map(
        (item) => item.textContent ?? '',
      )
    : [];
  const styles = parse(files, 'xl/styles.xml');
  const formats = new Map(
    all(styles, 'numFmt').map((format) => [
      format.getAttribute('numFmtId'),
      format.getAttribute('formatCode') ?? '',
    ]),
  );
  const fonts = all(styles, 'font');
  const fills = all(styles, 'fill');
  const xfs = all(all(styles, 'cellXfs')[0] as Element, 'xf');
  const workbook = parse(files, 'xl/workbook.xml');
  const filters = all(workbook, 'definedName').filter(
    (name) => name.getAttribute('name') === '_xlnm._FilterDatabase',
  );
  return all(workbook, 'sheet').map((sheet, index) => {
    const xml = parse(files, `xl/worksheets/sheet${index + 1}.xml`);
    const rows: (ReadCell | null)[][] = [];
    for (const row of all(xml, 'row')) {
      const cells: (ReadCell | null)[] = [];
      for (const cell of all(row, 'c')) {
        const xf = xfs[Number(cell.getAttribute('s') ?? 0)];
        const font = fonts[Number(xf?.getAttribute('fontId') ?? 0)];
        const fill = fills[Number(xf?.getAttribute('fillId') ?? 0)];
        const raw =
          cell.getElementsByTagNameNS(MAIN, 'v')[0]?.textContent ?? '';
        const dateFormat = formats.get(xf?.getAttribute('numFmtId') ?? null);
        const value =
          cell.getAttribute('t') === 's'
            ? (strings[Number(raw)] ?? '')
            : dateFormat
              ? serialDay(Number(raw))
              : Number(raw);
        cells[columnIndex(cell.getAttribute('r') ?? 'A')] = {
          value,
          ...(dateFormat ? { dateFormat } : {}),
          bold: font ? all(font, 'b').length > 0 : false,
          textColor: font ? color(all(font, 'color')[0]) : undefined,
          fill: fill ? color(all(fill, 'fgColor')[0]) : undefined,
          wrap:
            xf
              ?.getElementsByTagNameNS(MAIN, 'alignment')[0]
              ?.getAttribute('wrapText') === '1',
        };
      }
      rows[Number(row.getAttribute('r')) - 1] = Array.from(
        cells,
        (cell) => cell ?? null,
      );
    }
    const pane = all(xml, 'pane')[0];
    const widths: number[] = [];
    for (const column of all(xml, 'col')) {
      widths[Number(column.getAttribute('min')) - 1] = Number(
        column.getAttribute('width'),
      );
    }
    return {
      name: sheet.getAttribute('name') ?? '',
      rows: Array.from(rows, (row) => row ?? []),
      frozenRows:
        pane?.getAttribute('state') === 'frozen'
          ? Number(pane.getAttribute('ySplit'))
          : 0,
      autoFilter: all(xml, 'autoFilter')[0]?.getAttribute('ref') ?? undefined,
      filterDatabase: filters
        .find((name) => name.getAttribute('localSheetId') === String(index))
        ?.textContent?.trim(),
      widths,
    };
  });
}

/** The sheet's values only, row by row; an empty cell reads ''. */
export function sheetValues(sheet: ReadSheet): (string | number)[][] {
  return sheet.rows.map((row) => Array.from(row, (cell) => cell?.value ?? ''));
}
