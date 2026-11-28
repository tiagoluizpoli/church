import { m } from '@church/i18n/messages';
import {
  calendarDaysBetween,
  formatCalendarDay,
  formatWeekdayShort,
  type Locale,
  parseCalendarDay,
} from '@church/time';
import writeExcelFile, {
  type Feature,
  type Row,
  type Sheet,
} from 'write-excel-file/browser';
import {
  findElement,
  getCellAddress,
  getOrderOfSiblings,
  insertElementMarkupAccordingToOrderOfSiblings,
  replaceElement,
  sanitizeAttributeValue,
  sanitizeTextContent,
} from 'write-excel-file/utility';
import type {
  WorkbookColumn,
  WorkbookRow,
  WorkbookSheet,
  WorkbookSheetsInput,
  WorkbookSheetsOutput,
} from './schedule-export-workbook.types';
import { exportPartName } from '@/features/scheduling/components/prepare/schedule-export-part-name';
import type {
  GetScheduleExportData200PartsItem,
  GetScheduleExportData200PartsItemGroupsItemEventsItem,
  GetScheduleExportData200PartsItemGroupsItemEventsItemTimeBlocksItemShiftsItem,
} from '@/infrastructure/api/churchAPI.schemas';

type ExportPart = GetScheduleExportData200PartsItem;
type ExportEvent = GetScheduleExportData200PartsItemGroupsItemEventsItem;
type ExportShift =
  GetScheduleExportData200PartsItemGroupsItemEventsItemTimeBlocksItemShiftsItem;
/** write-excel-file's browser file content. */
type WorkbookContent = File | Blob | ArrayBuffer;

/** Characters Excel refuses in a sheet name, and its length limit. */
const BANNED_SHEET_CHARACTERS = /[[\]:*?/\\]/g;
const SHEET_NAME_MAX = 31;
/** Excel refuses a sheet name that starts or ends with an apostrophe. */
const EDGE_APOSTROPHES = /^[\s']+|[\s']+$/g;
const DATE_FORMAT = 'dd/mm/yyyy';
/** Day 0 of Excel's 1900 date system, as its later days count. */
const EXCEL_EPOCH = parseCalendarDay({ value: '1899-12-30' });

// apps/web/DESIGN.md tokens, as the Typst templates use them.
const HEADER_FILL = '#e5effa';
const CANCELLED_INK = '#d3252a';
const MUTED_INK = '#545f6b';
// The Typst palette's hues as light tints: a Sector's color only repeats its name.
const SECTOR_TINTS = ['#dcedff', '#d2f3f0', '#ddf2dd', '#eee6ff'];

const ALL_COLUMNS: WorkbookColumn[] = [
  'date',
  'weekday',
  'event',
  'time',
  'sector',
  'role',
  'volunteer',
];

interface ColumnLabelInput {
  column: WorkbookColumn;
}

/** A column header in the UI language. */
export function workbookColumnLabel({ column }: ColumnLabelInput): string {
  switch (column) {
    case 'date':
      return m.export_column_date();
    case 'weekday':
      return m.export_column_day();
    case 'event':
      return m.export_column_event();
    case 'time':
      return m.export_column_time();
    case 'sector':
      return m.export_column_sector();
    case 'role':
      return m.export_column_role();
    case 'volunteer':
      return m.export_column_volunteer();
  }
}

interface DayInput {
  day: string;
  locale: Locale;
}

/** `dom` / `Sun`: the short weekday, as the grid's day labels write it. */
function weekday({ day, locale }: DayInput): string {
  const short = formatWeekdayShort({
    day: parseCalendarDay({ value: day }),
    locale,
  }).replaceAll('.', '');
  return locale === 'pt-BR' ? short.toLowerCase() : short;
}

interface ShiftTimeInput {
  shift: ExportShift;
  locale: Locale;
}

/** `Turno 1 · sáb · 08h00–12h00`: the Shift's label and day when it has them. */
function shiftTime({ shift, locale }: ShiftTimeInput): string {
  const time = (value: string) => {
    const [hours = '', minutes = ''] = value.split(':');
    return m.export_time({ hours, minutes }, { locale });
  };
  return [
    shift.label,
    shift.day ? weekday({ day: shift.day, locale }) : null,
    `${time(shift.startTime)}–${time(shift.endTime)}`,
  ]
    .filter((text) => text !== null)
    .join(' · ');
}

interface EventTitleInput {
  title: string;
  label: string | null;
}

/** The title, plus the block label unless it is empty or repeats it. */
function eventTitle({ title, label }: EventTitleInput): string {
  return label && label.toLowerCase() !== title.toLowerCase()
    ? `${title} · ${label}`
    : title;
}

interface CancelledRowInput {
  title: string;
  /** "Não haverá culto" or "Cancelado", where the volunteer would be. */
  volunteer: string;
}

interface EventRowsInput {
  event: ExportEvent;
  locale: Locale;
}

/** The Event's rows in the data's own order: never sorted here. */
function eventRows({ event, locale }: EventRowsInput): WorkbookRow[] {
  const base = {
    day: event.startDay,
    weekday: weekday({ day: event.startDay, locale }),
  };
  const cancelled = ({ title, volunteer }: CancelledRowInput): WorkbookRow => ({
    ...base,
    event: title,
    time: '',
    sector: null,
    role: '',
    volunteer,
    tone: 'cancelled',
  });
  if (event.cancelled) {
    return [
      cancelled({
        title: event.title,
        volunteer: m.export_no_service({}, { locale }),
      }),
    ];
  }
  return event.timeBlocks.flatMap((block) => {
    const title = eventTitle({ title: event.title, label: block.label });
    if (block.cancelled) {
      return [
        cancelled({
          title,
          volunteer: m.export_block_cancelled({}, { locale }),
        }),
      ];
    }
    return block.shifts.flatMap((shift) =>
      shift.sectors.flatMap((sector) =>
        sector.people.map(
          (person): WorkbookRow => ({
            ...base,
            event: title,
            time: shiftTime({ shift, locale }),
            sector: { name: sector.name, paletteIndex: sector.paletteIndex },
            role: person.role,
            volunteer: person.name ?? m.export_empty_spot({}, { locale }),
            tone: person.name === null ? 'empty' : 'spot',
          }),
        ),
      ),
    );
  });
}

interface SingleLineInput {
  part: ExportPart;
  locale: Locale;
}

/** "Todos servem como Professor em Maternal", when the part has one of them. */
function singleLine({ part, locale }: SingleLineInput): string | null {
  const { singleRole: role, singleSector: sector } = part;
  if (role && sector) {
    return m.export_single_role_and_sector({ role, sector }, { locale });
  }
  if (role) return m.export_single_role({ role }, { locale });
  if (sector) return m.export_single_sector({ sector }, { locale });
  return null;
}

interface SheetNamesInput {
  names: string[];
}

/**
 * Names Excel accepts: banned characters and edge apostrophes dropped, at
 * most 31 characters, a clash (Excel ignores case) numbered " (2)", " (3)"…
 */
function sheetNames({ names }: SheetNamesInput): string[] {
  const taken = new Set<string>();
  return names.map((raw) => {
    const clean =
      raw
        .replace(BANNED_SHEET_CHARACTERS, '')
        .replace(/\s+/g, ' ')
        .replace(EDGE_APOSTROPHES, '') || m.export_schedule_kicker();
    for (let count = 1; ; count += 1) {
      const suffix = count === 1 ? '' : ` (${count})`;
      const cut = clean.slice(0, SHEET_NAME_MAX - suffix.length);
      const name = `${cut.replace(EDGE_APOSTROPHES, '')}${suffix}`;
      if (!taken.has(name.toLowerCase())) {
        taken.add(name.toLowerCase());
        return name;
      }
    }
  });
}

/**
 * The workbook's sheets (#1108): one "Escala" without a split, else one per
 * part in the data's order, each a flat list of the part's tree in order.
 * Setor or Função is left out of a sheet whose part has only one, which the
 * header states instead.
 */
export function scheduleExportSheets({
  data,
  locale,
}: WorkbookSheetsInput): WorkbookSheetsOutput {
  const names = sheetNames({
    names: data.parts.map(
      (part) => exportPartName({ part }) ?? m.export_schedule_kicker(),
    ),
  });
  const title = m.export_sheet_title(
    { ministry: data.ministry.name, cycle: data.cycle.name },
    { locale },
  );
  const range = `${formatCalendarDay({ day: parseCalendarDay({ value: data.range.from }) })} – ${formatCalendarDay({ day: parseCalendarDay({ value: data.range.to }) })}`;
  const sheets = data.parts.map((part, index): WorkbookSheet => {
    const line = [
      ...(data.isDraft ? [m.export_draft({}, { locale })] : []),
      ...[singleLine({ part, locale })].filter((text) => text !== null),
    ].join(' · ');
    return {
      name: names[index] ?? m.export_schedule_kicker(),
      header: [title, range, ...(line ? [line] : [])],
      columns: ALL_COLUMNS.filter(
        (column) =>
          (column !== 'sector' || part.singleSector === null) &&
          (column !== 'role' || part.singleRole === null),
      ),
      rows: part.groups.flatMap((group) =>
        group.events.flatMap((event) => eventRows({ event, locale })),
      ),
    };
  });
  return { sheets };
}

interface CellTextInput {
  row: WorkbookRow;
  column: WorkbookColumn;
}

/** A cell as the sheet shows it; dates read dd/mm/aaaa. */
export function workbookCellText({ row, column }: CellTextInput): string {
  switch (column) {
    case 'date':
      return formatCalendarDay({ day: parseCalendarDay({ value: row.day }) });
    case 'weekday':
      return row.weekday;
    case 'event':
      return row.event;
    case 'time':
      return row.time;
    case 'sector':
      return row.sector?.name ?? '';
    case 'role':
      return row.role;
    case 'volunteer':
      return row.volunteer;
  }
}

interface SheetLayoutInput {
  sheet: WorkbookSheet;
}

/** The 1-based row of the column header: header lines, a blank row, then it. */
function headerRowNumber({ sheet }: SheetLayoutInput): number {
  return sheet.header.length + 2;
}

/** The column header and list, e.g. `A4:G11`, for the filter buttons. */
function filterRange({ sheet }: SheetLayoutInput): [string, string] {
  const top = headerRowNumber({ sheet }) - 1;
  const bottom = top + sheet.rows.length;
  return [
    getCellAddress(top, 0),
    getCellAddress(bottom, sheet.columns.length - 1),
  ];
}

/** Widths in characters: the longest cell, the header leaving room for its filter button. */
function columnWidths({ sheet }: SheetLayoutInput) {
  return sheet.columns.map((column) => ({
    width: Math.max(
      workbookColumnLabel({ column }).length + 4,
      ...sheet.rows.map((row) => workbookCellText({ row, column }).length + 2),
    ),
  }));
}

interface DataRowInput {
  row: WorkbookRow;
  columns: WorkbookColumn[];
}

function dataRow({ row, columns }: DataRowInput): Row {
  const textColor =
    row.tone === 'cancelled'
      ? CANCELLED_INK
      : row.tone === 'empty'
        ? MUTED_INK
        : undefined;
  const tone = textColor ? { textColor } : {};
  return columns.map((column) => {
    if (column === 'date') {
      // A real date: Excel's day number shown through the date format.
      return {
        value: calendarDaysBetween({
          start: EXCEL_EPOCH,
          end: parseCalendarDay({ value: row.day }),
        }),
        type: Number,
        format: DATE_FORMAT,
        ...tone,
      };
    }
    const value = workbookCellText({ row, column });
    if (!value) return null;
    const tint =
      column === 'sector' && row.sector
        ? {
            backgroundColor:
              SECTOR_TINTS[row.sector.paletteIndex % SECTOR_TINTS.length],
          }
        : {};
    return { value, type: String, ...tone, ...tint };
  });
}

function sheetData({ sheet }: SheetLayoutInput): Row[] {
  return [
    ...sheet.header.map(
      (line, index): Row => [
        index === 0 ? { value: line, fontWeight: 'bold' } : { value: line },
      ],
    ),
    [null],
    sheet.columns.map((column) => ({
      value: workbookColumnLabel({ column }),
      fontWeight: 'bold',
      backgroundColor: HEADER_FILL,
    })),
    ...sheet.rows.map((row) => dataRow({ row, columns: sheet.columns })),
  ];
}

interface FiltersInput {
  sheets: WorkbookSheet[];
}

/**
 * Filter buttons on each sheet's column header: write-excel-file has no
 * auto filter, so this adds Excel's `<autoFilter/>` and the hidden
 * `_xlnm._FilterDatabase` name LibreOffice also reads.
 */
function autoFilters({ sheets }: FiltersInput): Feature<WorkbookContent> {
  const ranges = sheets.map((sheet) => filterRange({ sheet }));
  return {
    files: {
      transform: {
        'xl/worksheets/sheet{id}.xml': {
          // named-parameters-ignore: write-excel-file's feature hook signature
          transform: (xml, _options, { sheetIndex }) => {
            const range = ranges[sheetIndex];
            if (!range) return xml;
            return insertElementMarkupAccordingToOrderOfSiblings(
              xml,
              `<autoFilter ref="${range.join(':')}"/>`,
              getOrderOfSiblings('xl/worksheets/sheet{id}.xml', 'worksheet') ??
                [],
              'worksheet',
            );
          },
        },
        'xl/workbook.xml': {
          transform: (xml) => {
            const names = sheets
              .map((sheet, index) => {
                const range = ranges[index];
                if (!range) return '';
                const absolute = range
                  .map((cell) => cell.replace(/^([A-Z]+)(\d+)$/, '$$$1$$$2'))
                  .join(':');
                const quoted = `'${sheet.name.replaceAll("'", "''")}'!${absolute}`;
                return `<definedName name="_xlnm._FilterDatabase" localSheetId="${sanitizeAttributeValue(String(index))}" hidden="1">${sanitizeTextContent(quoted)}</definedName>`;
              })
              .join('');
            const definedNames = findElement(xml, 'definedNames');
            const markup = `<definedNames>${names}</definedNames>`;
            return definedNames
              ? replaceElement(xml, definedNames, markup)
              : insertElementMarkupAccordingToOrderOfSiblings(
                  xml,
                  markup,
                  getOrderOfSiblings('xl/workbook.xml', 'workbook') ?? [],
                  'workbook',
                );
          },
        },
      },
    },
  };
}

/**
 * The .xlsx file of the sheets, built in the browser: bold title, plain
 * header lines, a blank row, then the column header kept in view with
 * filter buttons on a light fill above the list. No logo.
 */
export function writeScheduleWorkbook({ sheets }: FiltersInput): Promise<Blob> {
  const written: Sheet<WorkbookContent>[] = sheets.map((sheet) => ({
    data: sheetData({ sheet }),
    sheet: sheet.name,
    columns: columnWidths({ sheet }),
    stickyRowsCount: headerRowNumber({ sheet }),
    orientation: 'landscape',
  }));
  return writeExcelFile(written, {
    // Named, so styled cells keep the sheet's font in every spreadsheet app.
    fontFamily: 'Calibri',
    fontSize: 11,
    features: [autoFilters({ sheets })],
  }).toBlob();
}
