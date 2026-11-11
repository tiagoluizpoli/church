import { describe, expect, it } from 'bun:test';
import { getPresentationTextFailures } from '../../validation/presentation-text-guard';

const PATH = 'apps/web/src/features/example/example.tsx';

const failuresFor = (source: string, path = PATH) =>
  getPresentationTextFailures({ files: [{ path, source }] });

describe('presentation text guard', () => {
  it('rejects JSX text, including a single word, with its location', () => {
    expect(
      failuresFor(`export const A = () => (
  <div>
    <span className="sr-only">Close</span>
  </div>
);
`),
    ).toEqual([
      `${PATH}:3:31: JSX text "Close": use a catalog message (m.*) or pass translated content`,
    ]);
  });

  it('accepts JSX text that is only punctuation, symbols, digits or entities', () => {
    expect(
      failuresFor(`export const A = () => (
  <p>
    {a} · {b} — ( / ) : 42 &nbsp; &middot; … ✓
  </p>
);
`),
    ).toEqual([]);
  });

  it('rejects string, template, conditional, fallback and concatenated JSX expressions', () => {
    expect(
      failuresFor(`export const A = () => (
  <p>
    {'Loading'}
    {\`\${count} items\`}
    {open ? 'Hide' : m.show()}
    {name ?? 'Unknown'}
    {ready && 'Done'}
    {'Hello, ' + name}
  </p>
);
`),
    ).toEqual([
      `${PATH}:3:6: JSX expression "Loading": use a catalog message (m.*) or pass translated content`,
      `${PATH}:4:6: JSX expression "\${count} items": use a catalog message (m.*) or pass translated content`,
      `${PATH}:5:13: JSX expression "Hide": use a catalog message (m.*) or pass translated content`,
      `${PATH}:6:14: JSX expression "Unknown": use a catalog message (m.*) or pass translated content`,
      `${PATH}:7:15: JSX expression "Done": use a catalog message (m.*) or pass translated content`,
      `${PATH}:8:6: JSX expression "Hello,": use a catalog message (m.*) or pass translated content`,
    ]);
  });

  it('accepts catalog calls, runtime data, call results and separators in JSX expressions', () => {
    expect(
      failuresFor(`export const A = () => (
  <p>
    {m.home_title()}
    {member.name}
    {\`\${first} · \${last}\`}
    {names.join(', ')}
    {format({ value, pattern: 'yyyy-MM-dd' })}
    {count > 0 ? count : '—'}
    {' '}
  </p>
);
`),
    ).toEqual([]);
  });

  it('rejects accessible, title, alt, placeholder and label-like attributes', () => {
    const failure = (position: string, name: string, text: string) =>
      `${PATH}:${position}: attribute "${name}" "${text}": use a catalog message (m.*) or pass translated content`;
    expect(
      failuresFor(`export const A = () => (
  <>
    <button aria-label="Close" title={open ? 'Hide' : 'Show'} />
    <img alt="Church logo" src={logo} />
    <input placeholder="Type to search" aria-description="Hint" />
    <Stat label="Draft" submitLabel={\`Save \${name}\`} emptyMessage="None" />
    <Field description="Optional" heading="Details" tooltipText="More" />
  </>
);
`),
    ).toEqual([
      failure('3:24', 'aria-label', 'Close'),
      failure('3:46', 'title', 'Hide'),
      failure('3:55', 'title', 'Show'),
      failure('4:14', 'alt', 'Church logo'),
      failure('5:24', 'placeholder', 'Type to search'),
      failure('5:58', 'aria-description', 'Hint'),
      failure('6:17', 'label', 'Draft'),
      failure('6:38', 'submitLabel', 'Save \u0024{name}'),
      failure('6:67', 'emptyMessage', 'None'),
      failure('7:24', 'description', 'Optional'),
      failure('7:43', 'heading', 'Details'),
      failure('7:65', 'tooltipText', 'More'),
    ]);
  });

  it('accepts technical attributes and non-linguistic presentation values', () => {
    expect(
      failuresFor(`export const A = () => (
  <>
    <div className="flex gap-2" data-testid="home-card" data-slot="card" role="dialog" />
    <section aria-labelledby="cycle-title" aria-describedby="hint" id="cycle" />
    <Link to="/schedules/$cycleId" params={{ cycleId }} variant="outline" />
    <input type="email" name="email" autoComplete="email" placeholder="name@example.com" />
    <a href="https://example.com/help" rel="noreferrer" target="_blank" />
    <Badge label={m.cycle_draft()} title={member.name} aria-label={\`\${count}\`} />
  </>
);
`),
    ).toEqual([]);
  });

  it('rejects label maps, option arrays, copy variables and wrapper defaults', () => {
    const failure = (position: string, context: string, text: string) =>
      `${PATH}:${position}: ${context} "${text}": use a catalog message (m.*) or pass translated content`;
    expect(
      failuresFor(`const STATUS_LABELS: Record<Status, string> = { open: 'Open', closed: m.closed() };
const options = [{ value: 'draft', label: 'Draft' }];
const emptyText = cond ? 'Nothing yet' : m.empty();
const steps = { prepare: { title: 'Prepare', to: '/prepare' } };
export function Close({ closeLabel = 'Close', variant = 'outline' }: Props) {}
export function named(title = 'Untitled') {}
`),
    ).toEqual([
      failure('1:55', 'value of "STATUS_LABELS"', 'Open'),
      failure('2:43', 'property "label"', 'Draft'),
      failure('3:26', 'variable "emptyText"', 'Nothing yet'),
      failure('4:35', 'property "title"', 'Prepare'),
      failure('5:38', 'default "closeLabel"', 'Close'),
      failure('6:31', 'default "title"', 'Untitled'),
    ]);
  });

  it('rejects copy returned by label-, title- or message-named functions', () => {
    const failure = (position: string, context: string, text: string) =>
      `${PATH}:${position}: ${context} "${text}": use a catalog message (m.*) or pass translated content`;
    expect(
      failuresFor(`export function statusLabel(status: Status) {
  if (status === 'open') return 'Open';
  return m.closed();
}
export const emptyMessage = (count: number) => (count > 0 ? m.some() : 'Nothing yet');
export function statusKey(status: Status) {
  return 'status-open';
}
export function eventSpanLabel(span: Span): 'hourly' | 'day_based' {
  return span.crossesDay ? 'day_based' : 'hourly';
}
`),
    ).toEqual([
      failure('2:33', 'return of "statusLabel"', 'Open'),
      failure('5:72', 'return of "emptyMessage"', 'Nothing yet'),
    ]);
  });

  it('accepts technical maps, ids, class names and diagnostics in errors and logs', () => {
    expect(
      failuresFor(`const routes = { home: '/home', schedule: '/schedules/$cycleId' };
const context = 'scheduling';
const labelId = 'cycle-label';
const titleClassName = 'text-lg font-semibold';
const TITLE_MAX_LENGTH = 80;
const tone = { text: 'text-muted-foreground', border: 'border-red-500' };
const options = [{ value: 'draft', label: m.cycle_draft() }];
const query = { title: member.title, description: event.notes };
throw new ValidationRuleError({ reason: 'EMPTY', message: 'Usual setup is empty' });
console.warn({ message: 'Retrying request' }, 'Request failed');
logger.error({ title: 'Startup failed' });
`),
    ).toEqual([]);
  });

  it('rejects copy passed to toasts, browser dialogs, validation and the document title', () => {
    const failure = (position: string, context: string, text: string) =>
      `${PATH}:${position}: ${context} "${text}": use a catalog message (m.*) or pass translated content`;
    expect(
      failuresFor(`toast('Saved');
toast.success(\`Saved \${name}\`);
toast.error(error.message, { description: 'Try again' });
window.confirm('Delete?');
alert(failed ? 'Failed' : m.done());
const schema = z.object({
  name: z.string().min(2, 'Name too short'),
  email: z.email('Invalid email'),
  site: z.string().startsWith('https', 'Must be secure'),
  code: z.string().refine(check, { message: 'Bad code' }),
});
document.title = 'Church';
`),
    ).toEqual([
      failure('1:7', 'argument of "toast"', 'Saved'),
      failure('2:15', 'argument of "toast.success"', 'Saved \u0024{name}'),
      failure('3:43', 'property "description"', 'Try again'),
      failure('4:16', 'argument of "window.confirm"', 'Delete?'),
      failure('5:16', 'argument of "alert"', 'Failed'),
      failure('7:27', 'validation message of "min"', 'Name too short'),
      failure('8:18', 'validation message of "email"', 'Invalid email'),
      failure('9:40', 'validation message of "startsWith"', 'Must be secure'),
      failure('10:45', 'property "message"', 'Bad code'),
      failure('12:18', 'assignment to "document.title"', 'Church'),
    ]);
  });

  it('accepts technical Zod values, toast ids and catalog-backed presentation calls', () => {
    expect(
      failuresFor(`const schema = z.object({
  status: z.enum(['draft', 'sent']).default('draft'),
  kind: z.literal('cycle'),
  site: z.string().startsWith('https', m.secure_url()),
  name: z.string().min(2, m.name_too_short()),
});
toast.error(m.save_failed(), { id: 'save-error' });
toast.dismiss('save-error');
document.title = m.app_title();
`),
    ).toEqual([]);
  });

  it('checks web and desktop source but skips tests, generated code, packages and docs', () => {
    const copy = 'export const A = () => <p>Hello</p>;\n';
    const files = [
      'apps/web/src/components/ui/dialog.tsx',
      'apps/desktop/src/bun/index.tsx',
      'apps/web/tests/components/dialog.component.test.tsx',
      'apps/web/src/routeTree.gen.tsx',
      'packages/i18n/src/paraglide/messages/en.tsx',
      'packages/db/src/purpose.tsx',
      'apps/fumadocs/app/page.tsx',
      'apps/server/seeds/recipes/home.tsx',
      'tooling/validation/example.tsx',
    ].map((path) => ({ path, source: copy }));
    files.push({
      path: 'apps/web/src/infrastructure/api/client.tsx',
      source: `/**\n * Generated by orval\n * Do not edit manually.\n */\n${copy}`,
    });
    expect(getPresentationTextFailures({ files })).toEqual([
      'apps/web/src/components/ui/dialog.tsx:1:27: JSX text "Hello": use a catalog message (m.*) or pass translated content',
      'apps/desktop/src/bun/index.tsx:1:27: JSX text "Hello": use a catalog message (m.*) or pass translated content',
    ]);
  });

  it('rejects literal email content and response messages on the server', () => {
    const path = 'apps/server/src/infrastructure/services/welcome-email.ts';
    const failure = (position: string, context: string, text: string) =>
      `${path}:${position}: ${context} "${text}": use a catalog message (m.*) or pass translated content`;
    expect(
      failuresFor(
        `export const content = () => ({
  subject: 'Welcome',
  greeting: m.email_greeting({ firstName }),
  heading: \`Hi \${firstName}\`,
  facts: ['You joined', m.email_fact()],
  list: [shift.label],
  action: { label: 'Open', url },
  footer: 'Sent by Church',
});
export const refuse = () => reply.code(400).send({ code: 'BAD', message: 'Bad request' });
`,
        path,
      ),
    ).toEqual([
      failure('2:12', 'email "subject"', 'Welcome'),
      failure('4:12', 'email "heading"', 'Hi \u0024{firstName}'),
      failure('5:11', 'email "facts"', 'You joined'),
      failure('7:20', 'email "action.label"', 'Open'),
      failure('8:11', 'email "footer"', 'Sent by Church'),
      failure('10:74', 'response "message"', 'Bad request'),
    ]);
  });

  it('accepts API docs, domain diagnostics, markup and logs on the server', () => {
    expect(
      failuresFor(
        `const route = { schema: { description: 'List the Church Cycles', tags: ['cycles'] } };
const openapi = { info: { title: 'Church API', version: '1.0.0' } };
const SCHEDULE_NOT_FOUND_MESSAGE = 'Schedule builder resource not found';
class InvalidTimeRangeError extends DomainError {
  constructor(message = 'Start time must be before end time') { super(message); }
}
const cursor = z.string().refine(isCursor, { message: 'Invalid cursor' });
const html = \`<h1 style="font-size:20px">\${escapeHtml(heading)}</h1>\`;
const text = \`--\\n\${footer}\`;
request.log.warn({ code }, 'No catalog message for code');
reply.send({ code: 'FORBIDDEN', message: m.error_forbidden({}, { locale }) });
`,
        'apps/server/src/api/controllers/cycle-controller.ts',
      ),
    ).toEqual([]);
  });

  it('honours a justified suppression on the line above and rejects unjustified or unused ones', () => {
    expect(
      failuresFor(`export const A = () => (
  <kbd>
    {/* presentation-text-ignore: keyboard key names are not translated */}
    Ctrl K
  </kbd>
);
// presentation-text-ignore: brand name
export const appTitle = 'Church';
// presentation-text-ignore
export const helpText = 'Help';
// presentation-text-ignore: nothing to suppress here
export const value = 42;
export const B = () => <p>Hello</p>; // presentation-text-ignore: same line does not count
`),
    ).toEqual([
      `${PATH}:9:1: presentation-text-ignore needs a reason: // presentation-text-ignore: <why this text is not translatable copy>`,
      `${PATH}:11:1: presentation-text-ignore suppresses nothing on the next line: remove it`,
      `${PATH}:13:27: JSX text "Hello": use a catalog message (m.*) or pass translated content`,
    ]);
  });
});
