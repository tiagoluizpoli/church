import { createFileRoute } from '@tanstack/react-router';
import {
  Circle,
  CircleDot,
  Crosshair,
  Eye,
  Fingerprint,
  LocateFixed,
  Radar,
  Sparkles,
  Square,
  SquareCheck,
  Target,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { WorkspacePage } from '@/components/workspace-page';
import { cn } from '@/lib/utils';

// PROTOTYPE — throwaway. Two sections on one route:
//   Section 1 — the wide 30-variant exploration (icon + placement +
//     selected-state treatment).
//   Section 2 — the narrowed set: icon locked to LocateFixed (#3), 10
//     placement/treatment variants around it.
// Each card is independently clickable to preview its selected state.
//
// Guardrails from impeccable's project context: no side-stripe borders as a
// selected accent (banned — full borders/backgrounds/top-bars only), no
// hover-ONLY affordances (older-skewing user base), reuse the existing
// green/amber/red staffing palette + rounded/spacing tokens.
//
// Delete this route once a winner is picked; fold into
// cycle-builder-matrix.tsx by hand.

export const Route = createFileRoute(
  '/scheduling/rostering/prototype-date-card-icons',
)({
  component: DateCardIconPrototypeRoute,
});

const SAMPLE = { date: 'Wed, Aug 12', percent: 62, events: 2 };

function staffing(percent: number) {
  if (percent >= 100)
    return { text: 'text-green-700 dark:text-green-400', bar: 'bg-green-600' };
  if (percent >= 50)
    return {
      text: 'text-yellow-700 dark:text-yellow-300',
      bar: 'bg-yellow-500',
    };
  return { text: 'text-destructive', bar: 'bg-destructive' };
}

interface RenderInput {
  selected: boolean;
  toggle: () => void;
}

interface CardShellProps {
  n: number;
  label: string;
  caption: string;
  children: (input: RenderInput) => ReactNode;
}

function CardShell({ n, label, caption, children }: CardShellProps) {
  const [selected, setSelected] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <span className="font-semibold text-foreground text-xs">
        {n}. {label}
      </span>
      {children({ selected, toggle: () => setSelected((v) => !v) })}
      <p className="text-muted-foreground text-xs">{caption}</p>
    </div>
  );
}

function CardBox({
  selected,
  selectedClassName,
  className,
  children,
}: {
  selected: boolean;
  selectedClassName?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-selected={selected}
      className={cn(
        'relative min-w-52 flex-1 overflow-hidden rounded-lg border border-border bg-card p-3 text-left transition-colors',
        selected && (selectedClassName ?? 'border-primary bg-primary/5'),
        className,
      )}
    >
      {children}
    </div>
  );
}

function StaffingFooter() {
  const s = staffing(SAMPLE.percent);
  return (
    <>
      <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted">
        <span
          className={cn('block h-full', s.bar)}
          style={{ width: `${SAMPLE.percent}%` }}
        />
      </span>
      <span className="mt-2 block text-muted-foreground text-xs">
        {SAMPLE.events} events · staffing progress
      </span>
    </>
  );
}

function PercentText({ className }: { className?: string }) {
  const s = staffing(SAMPLE.percent);
  return (
    <span className={cn('text-xs', s.text, className)}>{SAMPLE.percent}%</span>
  );
}

const cornerButton =
  'absolute top-1.5 right-1.5 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground aria-pressed:bg-primary/10 aria-pressed:text-primary';

// ════════════════════════════════════════════════════════════════════════
// SECTION 1 — the wide 30-variant exploration
// ════════════════════════════════════════════════════════════════════════

// ── Group 1 — corner overlay, icon language only ────────────────────────

function V1() {
  return (
    <CardShell
      n={1}
      label="Target, corner"
      caption="Bullseye — 'aim at this one.'"
    >
      {({ selected, toggle }) => (
        <CardBox selected={selected}>
          <button
            type="button"
            aria-pressed={selected}
            onClick={toggle}
            className={cornerButton}
          >
            <Target className="size-3.5" />
          </button>
          <span className="flex items-center justify-between pr-6 font-semibold text-sm">
            {SAMPLE.date}
            <PercentText />
          </span>
          <StaffingFooter />
        </CardBox>
      )}
    </CardShell>
  );
}

function V2() {
  return (
    <CardShell
      n={2}
      label="Crosshair, corner"
      caption="Literal reticle — the map/photo-app 'focus here' mark."
    >
      {({ selected, toggle }) => (
        <CardBox selected={selected}>
          <button
            type="button"
            aria-pressed={selected}
            onClick={toggle}
            className={cornerButton}
          >
            <Crosshair className="size-3.5" />
          </button>
          <span className="flex items-center justify-between pr-6 font-semibold text-sm">
            {SAMPLE.date}
            <PercentText />
          </span>
          <StaffingFooter />
        </CardBox>
      )}
    </CardShell>
  );
}

function V3() {
  return (
    <CardShell
      n={3}
      label="LocateFixed, corner"
      caption="'Center map here' — narrows focus, doesn't resize."
    >
      {({ selected, toggle }) => (
        <CardBox selected={selected}>
          <button
            type="button"
            aria-pressed={selected}
            onClick={toggle}
            className={cornerButton}
          >
            <LocateFixed className="size-3.5" />
          </button>
          <span className="flex items-center justify-between pr-6 font-semibold text-sm">
            {SAMPLE.date}
            <PercentText />
          </span>
          <StaffingFooter />
        </CardBox>
      )}
    </CardShell>
  );
}

function V4() {
  return (
    <CardShell
      n={4}
      label="Radar, corner"
      caption="Sweep-and-lock-on metaphor — 'scanning to this one.'"
    >
      {({ selected, toggle }) => (
        <CardBox selected={selected}>
          <button
            type="button"
            aria-pressed={selected}
            onClick={toggle}
            className={cornerButton}
          >
            <Radar className="size-3.5" />
          </button>
          <span className="flex items-center justify-between pr-6 font-semibold text-sm">
            {SAMPLE.date}
            <PercentText />
          </span>
          <StaffingFooter />
        </CardBox>
      )}
    </CardShell>
  );
}

function V5() {
  return (
    <CardShell
      n={5}
      label="Eye, corner"
      caption="'Look only at this day' — risk: reads as visibility toggle to some."
    >
      {({ selected, toggle }) => (
        <CardBox selected={selected}>
          <button
            type="button"
            aria-pressed={selected}
            onClick={toggle}
            className={cornerButton}
          >
            <Eye className="size-3.5" />
          </button>
          <span className="flex items-center justify-between pr-6 font-semibold text-sm">
            {SAMPLE.date}
            <PercentText />
          </span>
          <StaffingFooter />
        </CardBox>
      )}
    </CardShell>
  );
}

function V6() {
  return (
    <CardShell
      n={6}
      label="Fingerprint, corner"
      caption="'This one, uniquely' — unusual, worth ruling out fast."
    >
      {({ selected, toggle }) => (
        <CardBox selected={selected}>
          <button
            type="button"
            aria-pressed={selected}
            onClick={toggle}
            className={cornerButton}
          >
            <Fingerprint className="size-3.5" />
          </button>
          <span className="flex items-center justify-between pr-6 font-semibold text-sm">
            {SAMPLE.date}
            <PercentText />
          </span>
          <StaffingFooter />
        </CardBox>
      )}
    </CardShell>
  );
}

function V7() {
  return (
    <CardShell
      n={7}
      label="Sparkles, corner"
      caption="'Highlight this one' — closer to favorite/AI-pick than focus."
    >
      {({ selected, toggle }) => (
        <CardBox selected={selected}>
          <button
            type="button"
            aria-pressed={selected}
            onClick={toggle}
            className={cornerButton}
          >
            <Sparkles className="size-3.5" />
          </button>
          <span className="flex items-center justify-between pr-6 font-semibold text-sm">
            {SAMPLE.date}
            <PercentText />
          </span>
          <StaffingFooter />
        </CardBox>
      )}
    </CardShell>
  );
}

// ── Group 2 — same icon language, different placement ──────────────────

function V8() {
  return (
    <CardShell
      n={8}
      label="Crosshair, footer row"
      caption="Own line at the bottom — header line never shifts at all."
    >
      {({ selected, toggle }) => (
        <CardBox selected={selected}>
          <span className="flex items-center justify-between font-semibold text-sm">
            {SAMPLE.date}
            <PercentText />
          </span>
          <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted">
            <span
              className={cn('block h-full', staffing(SAMPLE.percent).bar)}
              style={{ width: `${SAMPLE.percent}%` }}
            />
          </span>
          <span className="mt-2 flex items-center justify-between text-muted-foreground text-xs">
            <span>{SAMPLE.events} events · staffing progress</span>
            <button
              type="button"
              aria-pressed={selected}
              onClick={toggle}
              className="-m-1 rounded-md p-1 hover:bg-muted hover:text-foreground aria-pressed:bg-primary/10 aria-pressed:text-primary"
            >
              <Crosshair className="size-3.5" />
            </button>
          </span>
        </CardBox>
      )}
    </CardShell>
  );
}

function V9() {
  return (
    <CardShell
      n={9}
      label="Target, inline before label"
      caption="Shares the header line; only the date label yields room, percent never moves."
    >
      {({ selected, toggle }) => (
        <CardBox selected={selected}>
          <span className="flex items-center justify-between font-semibold text-sm">
            <button
              type="button"
              aria-pressed={selected}
              onClick={toggle}
              className="-my-1 -ml-1 flex items-center gap-1.5 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground aria-pressed:text-primary"
            >
              <Target className="size-3.5" />
              {SAMPLE.date}
            </button>
            <PercentText />
          </span>
          <StaffingFooter />
        </CardBox>
      )}
    </CardShell>
  );
}

function V10() {
  return (
    <CardShell
      n={10}
      label="Target, inline after label"
      caption="Icon trails the date instead of leading it."
    >
      {({ selected, toggle }) => (
        <CardBox selected={selected}>
          <span className="flex items-center justify-between font-semibold text-sm">
            <button
              type="button"
              aria-pressed={selected}
              onClick={toggle}
              className="-my-1 flex items-center gap-1.5 rounded-md p-1 text-foreground hover:bg-muted aria-pressed:text-primary"
            >
              {SAMPLE.date}
              <Target className="size-3.5 text-muted-foreground" />
            </button>
            <PercentText />
          </span>
          <StaffingFooter />
        </CardBox>
      )}
    </CardShell>
  );
}

function V11() {
  return (
    <CardShell
      n={11}
      label="Target, top-center row"
      caption="Its own centered row above the date — vertical space instead of horizontal."
    >
      {({ selected, toggle }) => (
        <CardBox selected={selected}>
          <button
            type="button"
            aria-pressed={selected}
            onClick={toggle}
            className="mx-auto -mt-1 mb-1 flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground aria-pressed:bg-primary/10 aria-pressed:text-primary"
          >
            <Target className="size-3" />
            Focus
          </button>
          <span className="flex items-center justify-between font-semibold text-sm">
            {SAMPLE.date}
            <PercentText />
          </span>
          <StaffingFooter />
        </CardBox>
      )}
    </CardShell>
  );
}

function V12() {
  return (
    <CardShell
      n={12}
      label="Crosshair, bottom-center row"
      caption="Centered row above the events line — reads like a card-wide action bar."
    >
      {({ selected, toggle }) => (
        <CardBox selected={selected}>
          <span className="flex items-center justify-between font-semibold text-sm">
            {SAMPLE.date}
            <PercentText />
          </span>
          <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted">
            <span
              className={cn('block h-full', staffing(SAMPLE.percent).bar)}
              style={{ width: `${SAMPLE.percent}%` }}
            />
          </span>
          <span className="mt-2 block text-muted-foreground text-xs">
            {SAMPLE.events} events · staffing progress
          </span>
          <button
            type="button"
            aria-pressed={selected}
            onClick={toggle}
            className="mx-auto mt-2 flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground aria-pressed:bg-primary/10 aria-pressed:text-primary"
          >
            <Crosshair className="size-3" />
            Focus this day
          </button>
        </CardBox>
      )}
    </CardShell>
  );
}

function V13() {
  return (
    <CardShell
      n={13}
      label="Target, left gutter column"
      caption="Narrow left column, like a checkbox lane — content shifts right slightly."
    >
      {({ selected, toggle }) => (
        <CardBox selected={selected} className="flex gap-2 p-0">
          <button
            type="button"
            aria-pressed={selected}
            onClick={toggle}
            className="flex w-8 shrink-0 items-center justify-center self-stretch rounded-l-lg text-muted-foreground hover:bg-muted hover:text-foreground aria-pressed:bg-primary/10 aria-pressed:text-primary"
          >
            <Target className="size-3.5" />
          </button>
          <div className="flex-1 py-3 pr-3">
            <span className="flex items-center justify-between font-semibold text-sm">
              {SAMPLE.date}
              <PercentText />
            </span>
            <StaffingFooter />
          </div>
        </CardBox>
      )}
    </CardShell>
  );
}

// ── Group 3 — non-icon metaphors ────────────────────────────────────────

function V14() {
  return (
    <CardShell
      n={14}
      label="Checkbox square"
      caption="Familiar multi-select checkbox — maybe too 'select for bulk action.'"
    >
      {({ selected, toggle }) => (
        <CardBox selected={selected}>
          <span className="flex items-center justify-between font-semibold text-sm">
            <button
              type="button"
              aria-pressed={selected}
              onClick={toggle}
              className="-my-1 -ml-1 flex items-center gap-1.5 rounded-md p-1 hover:bg-muted"
            >
              {selected ? (
                <SquareCheck className="size-3.5 text-primary" />
              ) : (
                <Square className="size-3.5 text-muted-foreground" />
              )}
              {SAMPLE.date}
            </button>
            <PercentText />
          </span>
          <StaffingFooter />
        </CardBox>
      )}
    </CardShell>
  );
}

function V15() {
  return (
    <CardShell
      n={15}
      label="Radio dot"
      caption="Single-select semantic — matches 'only one date can be focused.'"
    >
      {({ selected, toggle }) => (
        <CardBox selected={selected}>
          <span className="flex items-center justify-between font-semibold text-sm">
            <button
              type="button"
              aria-pressed={selected}
              onClick={toggle}
              className="-my-1 -ml-1 flex items-center gap-1.5 rounded-md p-1 hover:bg-muted"
            >
              {selected ? (
                <CircleDot className="size-3.5 text-primary" />
              ) : (
                <Circle className="size-3.5 text-muted-foreground" />
              )}
              {SAMPLE.date}
            </button>
            <PercentText />
          </span>
          <StaffingFooter />
        </CardBox>
      )}
    </CardShell>
  );
}

function V16() {
  return (
    <CardShell
      n={16}
      label="Toggle switch, footer"
      caption="Explicit on/off pill switch instead of any icon glyph."
    >
      {({ selected, toggle }) => (
        <CardBox selected={selected}>
          <span className="flex items-center justify-between font-semibold text-sm">
            {SAMPLE.date}
            <PercentText />
          </span>
          <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted">
            <span
              className={cn('block h-full', staffing(SAMPLE.percent).bar)}
              style={{ width: `${SAMPLE.percent}%` }}
            />
          </span>
          <span className="mt-2 flex items-center justify-between text-muted-foreground text-xs">
            <span>Focus this day</span>
            <button
              type="button"
              role="switch"
              aria-checked={selected}
              onClick={toggle}
              className={cn(
                'relative h-4 w-7 rounded-full transition-colors',
                selected ? 'bg-primary' : 'bg-muted-foreground/30',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 size-3 rounded-full bg-background transition-all',
                  selected ? 'left-3.5' : 'left-0.5',
                )}
              />
            </button>
          </span>
        </CardBox>
      )}
    </CardShell>
  );
}

function V17() {
  return (
    <CardShell
      n={17}
      label="Text link — 'Focus'"
      caption="Plain language, zero icon-literacy needed — good for older-adult users."
    >
      {({ selected, toggle }) => (
        <CardBox selected={selected}>
          <span className="flex items-center justify-between font-semibold text-sm">
            {SAMPLE.date}
            <PercentText />
          </span>
          <StaffingFooter />
          <button
            type="button"
            aria-pressed={selected}
            onClick={toggle}
            className="mt-2 text-primary text-xs underline-offset-2 hover:underline aria-pressed:font-semibold"
          >
            {selected ? 'Showing this day only' : 'Focus'}
          </button>
        </CardBox>
      )}
    </CardShell>
  );
}

function V18() {
  return (
    <CardShell
      n={18}
      label="Text link — full sentence"
      caption="Maximally explicit copy, no ambiguity at all, costs more width."
    >
      {({ selected, toggle }) => (
        <CardBox selected={selected}>
          <span className="flex items-center justify-between font-semibold text-sm">
            {SAMPLE.date}
            <PercentText />
          </span>
          <StaffingFooter />
          <button
            type="button"
            aria-pressed={selected}
            onClick={toggle}
            className="mt-2 text-primary text-xs underline-offset-2 hover:underline"
          >
            {selected ? 'Show all dates' : 'View only this day'}
          </button>
        </CardBox>
      )}
    </CardShell>
  );
}

function V19() {
  return (
    <CardShell
      n={19}
      label="Percent badge is the click target"
      caption="Repurposes an element that already exists — no new icon added at all."
    >
      {({ selected, toggle }) => (
        <CardBox selected={selected}>
          <span className="flex items-center justify-between font-semibold text-sm">
            {SAMPLE.date}
            <button
              type="button"
              aria-pressed={selected}
              onClick={toggle}
              className="-my-1 -mr-1 rounded-md p-1 hover:bg-muted aria-pressed:bg-primary/10"
            >
              <PercentText />
            </button>
          </span>
          <StaffingFooter />
        </CardBox>
      )}
    </CardShell>
  );
}

function V20() {
  return (
    <CardShell
      n={20}
      label="Corner ribbon shape"
      caption="Pure shape, no glyph at all — a folded-corner tab in the selected color."
    >
      {({ selected, toggle }) => (
        <CardBox selected={selected}>
          <button
            type="button"
            aria-pressed={selected}
            aria-label="Focus this day"
            onClick={toggle}
            className="absolute top-0 right-0 size-6 [clip-path:polygon(100%_0,0_0,100%_100%)]"
          >
            <span
              className={cn(
                'block size-full',
                selected ? 'bg-primary' : 'bg-muted-foreground/25',
              )}
            />
          </button>
          <span className="flex items-center justify-between pr-2 font-semibold text-sm">
            {SAMPLE.date}
            <PercentText />
          </span>
          <StaffingFooter />
        </CardBox>
      )}
    </CardShell>
  );
}

function V21() {
  return (
    <CardShell
      n={21}
      label="Faint at rest, sharpens on hover/focus"
      caption="Never fully invisible (a11y: no hover-only) — just quieter until you're near it."
    >
      {({ selected, toggle }) => (
        <CardBox selected={selected}>
          <button
            type="button"
            aria-pressed={selected}
            onClick={toggle}
            className={cn(
              cornerButton,
              'opacity-50 hover:opacity-100 focus-visible:opacity-100',
              selected && 'opacity-100',
            )}
          >
            <Target className="size-3.5" />
          </button>
          <span className="flex items-center justify-between pr-6 font-semibold text-sm">
            {SAMPLE.date}
            <PercentText />
          </span>
          <StaffingFooter />
        </CardBox>
      )}
    </CardShell>
  );
}

// ── Group 4 — selected-state treatment (icon held constant) ─────────────

function V22() {
  return (
    <CardShell
      n={22}
      label="Ring highlight"
      caption="ring-2 instead of just a border color swap — reads stronger at a glance."
    >
      {({ selected, toggle }) => (
        <CardBox
          selected={selected}
          selectedClassName="border-primary bg-primary/5 ring-2 ring-primary ring-offset-1 ring-offset-background"
        >
          <button
            type="button"
            aria-pressed={selected}
            onClick={toggle}
            className={cornerButton}
          >
            <Target className="size-3.5" />
          </button>
          <span className="flex items-center justify-between pr-6 font-semibold text-sm">
            {SAMPLE.date}
            <PercentText />
          </span>
          <StaffingFooter />
        </CardBox>
      )}
    </CardShell>
  );
}

function V23() {
  return (
    <CardShell
      n={23}
      label="Background wash"
      caption="Stronger tint (bg-primary/10), border stays default — quieter than a ring."
    >
      {({ selected, toggle }) => (
        <CardBox selected={selected} selectedClassName="bg-primary/10">
          <button
            type="button"
            aria-pressed={selected}
            onClick={toggle}
            className={cornerButton}
          >
            <Crosshair className="size-3.5" />
          </button>
          <span className="flex items-center justify-between pr-6 font-semibold text-sm">
            {SAMPLE.date}
            <PercentText />
          </span>
          <StaffingFooter />
        </CardBox>
      )}
    </CardShell>
  );
}

function V24() {
  return (
    <CardShell
      n={24}
      label="Thicker border only"
      caption="border-2, no background change at all — most minimal state change."
    >
      {({ selected, toggle }) => (
        <CardBox
          selected={selected}
          selectedClassName="border-2 border-primary"
        >
          <button
            type="button"
            aria-pressed={selected}
            onClick={toggle}
            className={cornerButton}
          >
            <Target className="size-3.5" />
          </button>
          <span className="flex items-center justify-between pr-6 font-semibold text-sm">
            {SAMPLE.date}
            <PercentText />
          </span>
          <StaffingFooter />
        </CardBox>
      )}
    </CardShell>
  );
}

function V25() {
  return (
    <CardShell
      n={25}
      label="Elevated shadow + lift"
      caption="shadow-md and a slight scale — depth cue instead of color."
    >
      {({ selected, toggle }) => (
        <CardBox
          selected={selected}
          selectedClassName="border-primary shadow-md scale-[1.02]"
        >
          <button
            type="button"
            aria-pressed={selected}
            onClick={toggle}
            className={cornerButton}
          >
            <LocateFixed className="size-3.5" />
          </button>
          <span className="flex items-center justify-between pr-6 font-semibold text-sm">
            {SAMPLE.date}
            <PercentText />
          </span>
          <StaffingFooter />
        </CardBox>
      )}
    </CardShell>
  );
}

function V26() {
  return (
    <CardShell
      n={26}
      label="Top accent bar"
      caption="Full-width bar on the TOP edge (side-stripes are banned) when selected."
    >
      {({ selected, toggle }) => (
        <CardBox
          selected={selected}
          className={cn(
            'pt-4 before:absolute before:inset-x-0 before:top-0 before:h-1.5 before:rounded-t-lg',
            selected ? 'before:bg-primary' : 'before:bg-transparent',
          )}
        >
          <button
            type="button"
            aria-pressed={selected}
            onClick={toggle}
            className={cornerButton}
          >
            <Target className="size-3.5" />
          </button>
          <span className="flex items-center justify-between pr-6 font-semibold text-sm">
            {SAMPLE.date}
            <PercentText />
          </span>
          <StaffingFooter />
        </CardBox>
      )}
    </CardShell>
  );
}

// ── Group 5 — density / layout variants ─────────────────────────────────

function V27() {
  return (
    <CardShell
      n={27}
      label="Icon-only, tight spacing"
      caption="Same corner slot as #1, but pulled tighter to the edge — denser."
    >
      {({ selected, toggle }) => (
        <CardBox selected={selected}>
          <button
            type="button"
            aria-pressed={selected}
            onClick={toggle}
            className="absolute top-1 right-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground aria-pressed:bg-primary/10 aria-pressed:text-primary"
          >
            <Target className="size-3" />
          </button>
          <span className="flex items-center justify-between pr-5 font-semibold text-sm">
            {SAMPLE.date}
            <PercentText />
          </span>
          <StaffingFooter />
        </CardBox>
      )}
    </CardShell>
  );
}

function V28() {
  return (
    <CardShell
      n={28}
      label="Two-line header"
      caption="Percent drops to its own second line — frees the top line for date + icon."
    >
      {({ selected, toggle }) => (
        <CardBox selected={selected}>
          <button
            type="button"
            aria-pressed={selected}
            onClick={toggle}
            className={cornerButton}
          >
            <Target className="size-3.5" />
          </button>
          <span className="block pr-6 font-semibold text-sm">
            {SAMPLE.date}
          </span>
          <span className="mt-0.5 block text-right">
            <PercentText />
          </span>
          <StaffingFooter />
        </CardBox>
      )}
    </CardShell>
  );
}

function V29() {
  return (
    <CardShell
      n={29}
      label="Icon baked into the percent pill"
      caption="One combined control instead of two separate corner elements."
    >
      {({ selected, toggle }) => {
        const s = staffing(SAMPLE.percent);
        return (
          <CardBox selected={selected}>
            <span className="flex items-center justify-between font-semibold text-sm">
              {SAMPLE.date}
              <button
                type="button"
                aria-pressed={selected}
                onClick={toggle}
                className={cn(
                  '-my-1 -mr-1 flex items-center gap-1 rounded-md p-1 hover:bg-muted aria-pressed:bg-primary/10',
                  s.text,
                )}
              >
                <Target className="size-3" />
                {SAMPLE.percent}%
              </button>
            </span>
            <StaffingFooter />
          </CardBox>
        );
      }}
    </CardShell>
  );
}

function V30() {
  return (
    <CardShell
      n={30}
      label="No icon — the date label is the button"
      caption="Simplest possible: does 'focus' even need an icon? Percent never moves."
    >
      {({ selected, toggle }) => (
        <CardBox selected={selected}>
          <span className="flex items-center justify-between font-semibold text-sm">
            <button
              type="button"
              aria-pressed={selected}
              onClick={toggle}
              className="-my-1 -ml-1 rounded-md p-1 text-left hover:bg-muted aria-pressed:text-primary aria-pressed:underline"
            >
              {SAMPLE.date}
            </button>
            <PercentText />
          </span>
          <StaffingFooter />
        </CardBox>
      )}
    </CardShell>
  );
}

const WIDE_VARIANTS = [
  V1,
  V2,
  V3,
  V4,
  V5,
  V6,
  V7,
  V8,
  V9,
  V10,
  V11,
  V12,
  V13,
  V14,
  V15,
  V16,
  V17,
  V18,
  V19,
  V20,
  V21,
  V22,
  V23,
  V24,
  V25,
  V26,
  V27,
  V28,
  V29,
  V30,
];

// ════════════════════════════════════════════════════════════════════════
// SECTION 2 — narrowed: icon locked to LocateFixed (#3), 10 placements
// ════════════════════════════════════════════════════════════════════════

const corner = cornerButton;

function L1() {
  return (
    <CardShell
      n={1}
      label="Corner, border+wash"
      caption="Today's slot. Border-color + faint bg on select."
    >
      {({ selected, toggle }) => (
        <CardBox selected={selected}>
          <button
            type="button"
            aria-pressed={selected}
            onClick={toggle}
            className={corner}
          >
            <LocateFixed className="size-3.5" />
          </button>
          <span className="flex items-center justify-between pr-6 font-semibold text-sm">
            {SAMPLE.date}
            <PercentText />
          </span>
          <StaffingFooter />
        </CardBox>
      )}
    </CardShell>
  );
}

function L2() {
  return (
    <CardShell
      n={2}
      label="Corner, ring highlight"
      caption="Same slot, ring-2 selected state — stronger at a glance."
    >
      {({ selected, toggle }) => (
        <CardBox
          selected={selected}
          selectedClassName="border-primary bg-primary/5 ring-2 ring-primary ring-offset-1 ring-offset-background"
        >
          <button
            type="button"
            aria-pressed={selected}
            onClick={toggle}
            className={corner}
          >
            <LocateFixed className="size-3.5" />
          </button>
          <span className="flex items-center justify-between pr-6 font-semibold text-sm">
            {SAMPLE.date}
            <PercentText />
          </span>
          <StaffingFooter />
        </CardBox>
      )}
    </CardShell>
  );
}

function L3() {
  return (
    <CardShell
      n={3}
      label="Corner, top accent bar"
      caption="Full-width bar on the top edge when selected (side-stripes are banned)."
    >
      {({ selected, toggle }) => (
        <CardBox
          selected={selected}
          className={cn(
            'pt-4 before:absolute before:inset-x-0 before:top-0 before:h-1.5',
            selected ? 'before:bg-primary' : 'before:bg-transparent',
          )}
        >
          <button
            type="button"
            aria-pressed={selected}
            onClick={toggle}
            className={corner}
          >
            <LocateFixed className="size-3.5" />
          </button>
          <span className="flex items-center justify-between pr-6 font-semibold text-sm">
            {SAMPLE.date}
            <PercentText />
          </span>
          <StaffingFooter />
        </CardBox>
      )}
    </CardShell>
  );
}

function L4() {
  return (
    <CardShell
      n={4}
      label="Inline before date"
      caption="Shares the header line; only the label yields room, percent never moves."
    >
      {({ selected, toggle }) => (
        <CardBox selected={selected}>
          <span className="flex items-center justify-between font-semibold text-sm">
            <button
              type="button"
              aria-pressed={selected}
              onClick={toggle}
              className="-my-1 -ml-1 flex items-center gap-1.5 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground aria-pressed:text-primary"
            >
              <LocateFixed className="size-3.5" />
              {SAMPLE.date}
            </button>
            <PercentText />
          </span>
          <StaffingFooter />
        </CardBox>
      )}
    </CardShell>
  );
}

function L5() {
  return (
    <CardShell
      n={5}
      label="Footer, icon only"
      caption="Own line at the bottom — header line never shifts at all."
    >
      {({ selected, toggle }) => (
        <CardBox selected={selected}>
          <span className="flex items-center justify-between font-semibold text-sm">
            {SAMPLE.date}
            <PercentText />
          </span>
          <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted">
            <span
              className={cn('block h-full', staffing(SAMPLE.percent).bar)}
              style={{ width: `${SAMPLE.percent}%` }}
            />
          </span>
          <span className="mt-2 flex items-center justify-between text-muted-foreground text-xs">
            <span>{SAMPLE.events} events · staffing progress</span>
            <button
              type="button"
              aria-pressed={selected}
              onClick={toggle}
              className="-m-1 rounded-md p-1 hover:bg-muted hover:text-foreground aria-pressed:bg-primary/10 aria-pressed:text-primary"
            >
              <LocateFixed className="size-3.5" />
            </button>
          </span>
        </CardBox>
      )}
    </CardShell>
  );
}

function L6() {
  return (
    <CardShell
      n={6}
      label="Footer, icon + label"
      caption="Icon plus the word — no icon-literacy gamble, good for older users."
    >
      {({ selected, toggle }) => (
        <CardBox selected={selected}>
          <span className="flex items-center justify-between font-semibold text-sm">
            {SAMPLE.date}
            <PercentText />
          </span>
          <StaffingFooter />
          <button
            type="button"
            aria-pressed={selected}
            onClick={toggle}
            className="mt-2 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-muted-foreground text-xs hover:bg-muted hover:text-foreground aria-pressed:bg-primary/10 aria-pressed:text-primary"
          >
            <LocateFixed className="size-3.5" />
            {selected ? 'Focused' : 'Focus this day'}
          </button>
        </CardBox>
      )}
    </CardShell>
  );
}

function L7() {
  return (
    <CardShell
      n={7}
      label="Top-center pill"
      caption="Centered mini-pill above the date — uses vertical space, header line stays clean."
    >
      {({ selected, toggle }) => (
        <CardBox selected={selected}>
          <button
            type="button"
            aria-pressed={selected}
            onClick={toggle}
            className="mx-auto -mt-1 mb-1 flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground aria-pressed:bg-primary/10 aria-pressed:text-primary"
          >
            <LocateFixed className="size-3" />
            Focus
          </button>
          <span className="flex items-center justify-between font-semibold text-sm">
            {SAMPLE.date}
            <PercentText />
          </span>
          <StaffingFooter />
        </CardBox>
      )}
    </CardShell>
  );
}

function L8() {
  return (
    <CardShell
      n={8}
      label="Left gutter column"
      caption="Full-height lane on the left, like a select column — big touch target."
    >
      {({ selected, toggle }) => (
        <CardBox selected={selected} className="flex gap-0 p-0">
          <button
            type="button"
            aria-pressed={selected}
            onClick={toggle}
            className="flex w-9 shrink-0 items-center justify-center self-stretch rounded-l-lg border-border border-r text-muted-foreground hover:bg-muted hover:text-foreground aria-pressed:bg-primary/10 aria-pressed:text-primary"
          >
            <LocateFixed className="size-3.5" />
          </button>
          <div className="flex-1 p-3">
            <span className="flex items-center justify-between font-semibold text-sm">
              {SAMPLE.date}
              <PercentText />
            </span>
            <StaffingFooter />
          </div>
        </CardBox>
      )}
    </CardShell>
  );
}

function L9() {
  return (
    <CardShell
      n={9}
      label="Two-line header"
      caption="Percent drops to its own line — top line is date + icon only, roomiest."
    >
      {({ selected, toggle }) => (
        <CardBox selected={selected}>
          <button
            type="button"
            aria-pressed={selected}
            onClick={toggle}
            className={corner}
          >
            <LocateFixed className="size-3.5" />
          </button>
          <span className="block pr-6 font-semibold text-sm">
            {SAMPLE.date}
          </span>
          <span className="mt-0.5 block">
            <PercentText />
          </span>
          <StaffingFooter />
        </CardBox>
      )}
    </CardShell>
  );
}

function L10() {
  return (
    <CardShell
      n={10}
      label="Corner, faint at rest"
      caption="Quieter until hovered/focused (never invisible — a11y). Least visual weight."
    >
      {({ selected, toggle }) => (
        <CardBox selected={selected}>
          <button
            type="button"
            aria-pressed={selected}
            onClick={toggle}
            className={cn(
              corner,
              'opacity-45 hover:opacity-100 focus-visible:opacity-100',
              selected && 'opacity-100',
            )}
          >
            <LocateFixed className="size-3.5" />
          </button>
          <span className="flex items-center justify-between pr-6 font-semibold text-sm">
            {SAMPLE.date}
            <PercentText />
          </span>
          <StaffingFooter />
        </CardBox>
      )}
    </CardShell>
  );
}

const LOCATE_VARIANTS = [L1, L2, L3, L4, L5, L6, L7, L8, L9, L10];

function DateCardIconPrototypeRoute() {
  return (
    <WorkspacePage>
      <div className="w-full px-4 py-6 pb-12 sm:px-6 lg:px-10">
        <div className="mb-5 rounded-lg border border-primary/40 border-dashed bg-primary/5 px-4 py-3 text-muted-foreground text-xs">
          <strong className="text-foreground">PROTOTYPE ONLY</strong> — the
          Cycle Builder date card's "focus on this day" affordance. Click any
          card to preview its selected look.
        </div>

        <h2 className="mb-3 font-semibold text-foreground text-sm">
          Wide exploration — 30 variants (icon language, placement, non-icon
          metaphors, selected-state treatment, density)
        </h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-6">
          {WIDE_VARIANTS.map((Variant, index) => (
            <Variant key={index} />
          ))}
        </div>

        <h2 className="mt-10 mb-3 font-semibold text-foreground text-sm">
          Narrowed — icon locked to LocateFixed (#3), 10 placement/treatment
          variants
        </h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-6">
          {LOCATE_VARIANTS.map((Variant, index) => (
            <Variant key={index} />
          ))}
        </div>
      </div>
    </WorkspacePage>
  );
}
