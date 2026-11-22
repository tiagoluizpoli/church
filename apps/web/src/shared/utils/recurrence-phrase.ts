import { m } from '@church/i18n/messages';
import { formatWeekdayOfIndex, type Locale } from '@church/time';
import type { UpdateEventTemplateBodyRecurrence as Recurrence } from '@/infrastructure/api/churchAPI.schemas';

type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
type Ordinal = 1 | 2 | 3 | 4 | 5 | 'last';
type MonthlyEntry = Extract<Recurrence, { kind: 'monthly' }>['entries'][number];

const MONDAY = 1;
const FRIDAY = 5;
const ORDINAL_ORDER: readonly Ordinal[] = [1, 2, 3, 4, 5, 'last'];
const ORDINAL_MESSAGES = {
  1: [m.recurrence_ordinal_1_m, m.recurrence_ordinal_1_f],
  2: [m.recurrence_ordinal_2_m, m.recurrence_ordinal_2_f],
  3: [m.recurrence_ordinal_3_m, m.recurrence_ordinal_3_f],
  4: [m.recurrence_ordinal_4_m, m.recurrence_ordinal_4_f],
  5: [m.recurrence_ordinal_5_m, m.recurrence_ordinal_5_f],
  last: [m.recurrence_ordinal_last_m, m.recurrence_ordinal_last_f],
} as const;

interface DescribeRecurrenceInput {
  recurrence: Recurrence;
  locale: Locale;
}

// pt-BR weekdays Monday–Friday are feminine ("segunda-feira"), the rest masculine.
interface WeekdayInput {
  weekday: Weekday;
}

interface LocaleInput {
  locale: Locale;
}

interface TextInput extends LocaleInput {
  text: string;
}

interface WeekdaysInput extends LocaleInput {
  weekdays: Weekday[];
}

interface EntriesInput extends LocaleInput {
  entries: MonthlyEntry[];
}

function isFeminine({ weekday }: WeekdayInput) {
  return weekday >= MONDAY && weekday <= FRIDAY;
}

function upperFirst({ text, locale }: TextInput) {
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

function lowerFirst({ text, locale }: TextInput) {
  return text.charAt(0).toLocaleLowerCase(locale) + text.slice(1);
}

function sortedUnique<T>(values: T[]) {
  return [...new Set(values)].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
}

// English weekdays are proper nouns; pt-BR ones are lower-case mid-sentence.
function weekdayName({ weekday, locale }: WeekdayInput & LocaleInput) {
  const name = formatWeekdayOfIndex({ index: weekday, locale });
  return locale === 'en' ? name : name.toLocaleLowerCase(locale);
}

function weeklyPhrase({ weekdays, locale }: WeekdaysInput) {
  const ordered = sortedUnique(weekdays);
  const [only] = ordered;
  if (ordered.length === 1 && only !== undefined) {
    const phrase = isFeminine({ weekday: only })
      ? m.recurrence_weekly_one_f
      : m.recurrence_weekly_one_m;
    return phrase(
      { weekday: weekdayName({ weekday: only, locale }) },
      { locale },
    );
  }
  const names = ordered.map((weekday) => weekdayName({ weekday, locale }));
  const list = new Intl.ListFormat(locale, { type: 'conjunction' }).format(
    names,
  );
  return m.recurrence_weekly_many({ weekdays: list }, { locale });
}

function monthlyPhrases({ entries, locale }: EntriesInput) {
  const ordinalsByWeekday = new Map<Weekday, Ordinal[]>();
  const days: number[] = [];
  let hasLastDay = false;
  for (const entry of entries) {
    if (entry.kind === 'nthWeekday') {
      const ordinals = ordinalsByWeekday.get(entry.weekday) ?? [];
      ordinalsByWeekday.set(entry.weekday, [...ordinals, entry.ordinal]);
    } else if (entry.kind === 'dayOfMonth') {
      days.push(entry.day);
    } else {
      hasLastDay = true;
    }
  }

  const nthPhrases = sortedUnique([...ordinalsByWeekday.keys()]).map(
    (weekday) => {
      const feminine = isFeminine({ weekday }) ? 1 : 0;
      const present = new Set(ordinalsByWeekday.get(weekday));
      const ordinals = ORDINAL_ORDER.filter((ordinal) => present.has(ordinal));
      const labels = ordinals.map((ordinal) =>
        ORDINAL_MESSAGES[ordinal][feminine]({}, { locale }),
      );
      return m.recurrence_nth_weekday(
        {
          ordinals: new Intl.ListFormat(locale, { type: 'conjunction' }).format(
            labels,
          ),
          weekday: weekdayName({ weekday, locale }),
        },
        { locale },
      );
    },
  );
  const dayPhrases = sortedUnique(days).map((day) =>
    m.recurrence_day_of_month({ day }, { locale }),
  );
  const lastDayPhrases = hasLastDay
    ? [m.recurrence_last_day({}, { locale })]
    : [];
  return [...nthPhrases, ...dayPhrases, ...lastDayPhrases];
}

/** A Recurrence in words ("Todo domingo", "1º e 3º domingo do mês"). The same phrase for the same Recurrence, whatever order its entries were typed in. */
export function describeRecurrence({
  recurrence,
  locale,
}: DescribeRecurrenceInput): string {
  const phrases =
    recurrence.kind === 'weekly'
      ? [weeklyPhrase({ weekdays: recurrence.weekdays, locale })]
      : monthlyPhrases({ entries: recurrence.entries, locale });
  const [first = '', ...rest] = phrases;
  return [
    upperFirst({ text: first, locale }),
    ...rest.map((p) => lowerFirst({ text: p, locale })),
  ].join('; ');
}
