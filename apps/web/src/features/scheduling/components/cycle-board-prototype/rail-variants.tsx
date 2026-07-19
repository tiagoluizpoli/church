// PROTOTYPE ONLY — 30 volunteer-rail designs on one route (A..J originals,
// K..AD recombinations). Flip with ?variant=A..AD (floating bar). Throwaway;
// the winner gets rebuilt properly in features/scheduling/components/builder.
// Do not import into prod.
import {
  ClockIcon,
  FlameIcon,
  GripVerticalIcon,
  LayersIcon,
  SearchIcon,
  TrophyIcon,
  UsersRoundIcon,
} from 'lucide-react';
import { type ReactElement, type ReactNode, useState } from 'react';
import type { PrototypeVolunteer } from './prototype-data';
import { useVolunteerDraggable } from './prototype-dnd';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// --- variant contract --------------------------------------------------------

export interface RailVariantProps {
  volunteers: PrototypeVolunteer[];
  selectedVolunteerId: string | null;
  activeVolunteerId: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  onSelect: (volunteerId: string) => void;
}

export interface GhostProps {
  volunteer: PrototypeVolunteer;
}

export interface RailVariant {
  key: string;
  name: string;
  Rail: (props: RailVariantProps) => ReactElement;
  Ghost: (props: GhostProps) => ReactElement;
}

// --- shared bits (header/search are fine to share; the BODY is what differs) --

const AVAILABILITY_LABELS = {
  confirmed: 'Confirmed',
  'needs-response': 'Needs response',
  conflict: 'Conflict',
} as const;

function availabilityTone(availability: PrototypeVolunteer['availability']) {
  if (availability === 'confirmed') return 'text-emerald-700';
  if (availability === 'conflict') return 'text-red-700';
  return 'text-amber-700';
}

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function loadPercent(assignments: number) {
  return Math.min(100, Math.round((assignments / 4) * 100));
}

function weeksAgo(lastServed: string) {
  const match = lastServed.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function InitialsCircle({
  name,
  className = '',
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-primary/12 font-semibold text-[11px] text-primary ${className}`}
    >
      {initials(name)}
    </span>
  );
}

function StatusPill({
  availability,
}: {
  availability: PrototypeVolunteer['availability'];
}) {
  return (
    <span className={`shrink-0 text-[11px] ${availabilityTone(availability)}`}>
      {AVAILABILITY_LABELS[availability]}
    </span>
  );
}

function LoadMeter({ assignments }: { assignments: number }) {
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <span
        className="block h-full rounded-full bg-primary/70"
        style={{ width: `${loadPercent(assignments)}%` }}
      />
    </span>
  );
}

function RailFrame({
  count,
  subtitle = 'Select or drag a person onto a role. Ordered by recommendation fairness.',
  search,
  onSearchChange,
  showSearch = true,
  children,
}: {
  count: number;
  subtitle?: string;
  search: string;
  onSearchChange: (value: string) => void;
  showSearch?: boolean;
  children: ReactNode;
}) {
  return (
    <aside className="h-fit rounded-xl border border-border bg-card p-4 xl:sticky xl:top-4">
      <div className="flex items-center gap-2">
        <UsersRoundIcon className="size-4 text-primary" />
        <h2 className="font-semibold text-sm">Volunteer list</h2>
        <Badge variant="secondary" className="ml-auto">
          {count}
        </Badge>
      </div>
      <p className="mt-1 text-muted-foreground text-xs">{subtitle}</p>
      {showSearch ? (
        <div className="relative mt-3">
          <SearchIcon className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            className="pl-9"
            placeholder="Search people or teams"
          />
        </div>
      ) : null}
      <div className="mt-3">{children}</div>
    </aside>
  );
}

// Draggable wrapper: keyboard + pointer a11y come from dnd-kit listeners/attrs.
function DragBox({
  volunteer,
  activeVolunteerId,
  selectedVolunteerId,
  onSelect,
  className,
  activeClassName = 'border-primary bg-primary/8',
  idleClassName = 'border-border hover:border-primary/50',
  children,
}: {
  volunteer: PrototypeVolunteer;
  activeVolunteerId: string | null;
  selectedVolunteerId: string | null;
  onSelect: (id: string) => void;
  className: string;
  activeClassName?: string;
  idleClassName?: string;
  children: ReactNode;
}) {
  const { setNodeRef, listeners, attributes, isDragging } =
    useVolunteerDraggable(volunteer);
  const selected = selectedVolunteerId === volunteer.id;
  const dimmed = isDragging || activeVolunteerId === volunteer.id;
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...listeners}
      {...attributes}
      onClick={() => onSelect(volunteer.id)}
      className={`${className} ${selected ? activeClassName : idleClassName} ${dimmed ? 'opacity-40' : ''} cursor-grab text-left active:cursor-grabbing`}
    >
      {children}
    </button>
  );
}

// --- ghost cards (reused across variants that share a card idiom) ------------

function RowGhost({ volunteer }: GhostProps) {
  return (
    <div className="flex w-72 items-center gap-2 rounded-lg border border-primary bg-card p-3 shadow-xl">
      <GripVerticalIcon className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-sm">
          {volunteer.name}
        </span>
        <span className="block text-muted-foreground text-xs">
          {volunteer.team} · {volunteer.assignments} cycle assignments
        </span>
      </span>
      <StatusPill availability={volunteer.availability} />
    </div>
  );
}

function AvatarGhost({ volunteer }: GhostProps) {
  return (
    <div className="flex w-64 items-center gap-3 rounded-xl border border-primary bg-card p-3 shadow-xl">
      <InitialsCircle name={volunteer.name} className="size-9" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-sm">
          {volunteer.name}
        </span>
        <span className="block text-muted-foreground text-xs">
          {volunteer.team}
        </span>
      </span>
    </div>
  );
}

function TileGhost({ volunteer }: GhostProps) {
  return (
    <div className="flex w-40 flex-col items-center gap-2 rounded-xl border border-primary bg-card p-3 text-center shadow-xl">
      <InitialsCircle name={volunteer.name} className="size-10" />
      <span className="truncate font-medium text-xs">{volunteer.name}</span>
      <span className="text-[11px] text-muted-foreground">
        {volunteer.assignments} assignments
      </span>
    </div>
  );
}

function TokenGhost({ volunteer }: GhostProps) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-primary bg-card px-3 py-1.5 shadow-xl">
      <InitialsCircle name={volunteer.name} className="size-5 text-[9px]" />
      <span className="font-medium text-xs">
        {volunteer.name.split(' ')[0]}
      </span>
    </span>
  );
}

// =============================================================================
// VARIANTS
// =============================================================================

// A — Refined rows (baseline, polished version of today's rail).
function RailA(props: RailVariantProps) {
  return (
    <RailFrame count={props.volunteers.length} {...pick(props)}>
      <div className="space-y-2">
        {props.volunteers.map((volunteer) => (
          <DragBox
            key={volunteer.id}
            volunteer={volunteer}
            activeVolunteerId={props.activeVolunteerId}
            selectedVolunteerId={props.selectedVolunteerId}
            onSelect={props.onSelect}
            className="flex w-full items-center gap-2 rounded-lg border p-3"
          >
            <GripVerticalIcon className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-sm">
                {volunteer.name}
              </span>
              <span className="block text-muted-foreground text-xs">
                {volunteer.team} · {volunteer.assignments} cycle assignments
              </span>
            </span>
            <StatusPill availability={volunteer.availability} />
          </DragBox>
        ))}
      </div>
    </RailFrame>
  );
}

// B — Avatar-forward cards with a fairness load meter.
function RailB(props: RailVariantProps) {
  return (
    <RailFrame count={props.volunteers.length} {...pick(props)}>
      <div className="space-y-2">
        {props.volunteers.map((volunteer) => (
          <DragBox
            key={volunteer.id}
            volunteer={volunteer}
            activeVolunteerId={props.activeVolunteerId}
            selectedVolunteerId={props.selectedVolunteerId}
            onSelect={props.onSelect}
            className="flex w-full flex-col gap-2 rounded-xl border p-3"
          >
            <span className="flex items-center gap-3">
              <InitialsCircle name={volunteer.name} className="size-9" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-sm">
                  {volunteer.name}
                </span>
                <span className="block text-muted-foreground text-xs">
                  {volunteer.team}
                </span>
              </span>
              <StatusPill availability={volunteer.availability} />
            </span>
            <span className="flex items-center gap-2">
              <LoadMeter assignments={volunteer.assignments} />
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {volunteer.assignments} load
              </span>
            </span>
          </DragBox>
        ))}
      </div>
    </RailFrame>
  );
}

// C — Fairness leaderboard: ranked by lowest load first, "Next up" on the leader.
function RailC(props: RailVariantProps) {
  const ranked = [...props.volunteers].sort(
    (a, b) => a.assignments - b.assignments,
  );
  return (
    <RailFrame
      count={props.volunteers.length}
      subtitle="Ranked by fairness — lightest load first."
      {...pick(props)}
    >
      <div className="space-y-2">
        {ranked.map((volunteer, index) => (
          <DragBox
            key={volunteer.id}
            volunteer={volunteer}
            activeVolunteerId={props.activeVolunteerId}
            selectedVolunteerId={props.selectedVolunteerId}
            onSelect={props.onSelect}
            className="flex w-full items-center gap-3 rounded-lg border p-3"
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-[11px]">
              {index + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate font-medium text-sm">
                  {volunteer.name}
                </span>
                {index === 0 ? (
                  <span className="flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700">
                    <TrophyIcon className="size-3" /> Next up
                  </span>
                ) : null}
              </span>
              <span className="mt-1 block">
                <LoadMeter assignments={volunteer.assignments} />
              </span>
            </span>
          </DragBox>
        ))}
      </div>
    </RailFrame>
  );
}

// D — Grouped by team.
function RailD(props: RailVariantProps) {
  const teams = groupBy(props.volunteers, (v) => v.team);
  return (
    <RailFrame count={props.volunteers.length} {...pick(props)}>
      <div className="space-y-4">
        {teams.map(([team, members]) => (
          <div key={team}>
            <div className="mb-1.5 flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wide">
              <LayersIcon className="size-3.5" />
              {team}
              <span className="ml-auto normal-case">{members.length}</span>
            </div>
            <div className="space-y-1.5">
              {members.map((volunteer) => (
                <DragBox
                  key={volunteer.id}
                  volunteer={volunteer}
                  activeVolunteerId={props.activeVolunteerId}
                  selectedVolunteerId={props.selectedVolunteerId}
                  onSelect={props.onSelect}
                  className="flex w-full items-center gap-2 rounded-md border p-2.5"
                >
                  <InitialsCircle name={volunteer.name} className="size-7" />
                  <span className="min-w-0 flex-1 truncate font-medium text-sm">
                    {volunteer.name}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {volunteer.assignments}×
                  </span>
                </DragBox>
              ))}
            </div>
          </div>
        ))}
      </div>
    </RailFrame>
  );
}

// E — Availability buckets: ready vs awaiting response.
function RailE(props: RailVariantProps) {
  const ready = props.volunteers.filter((v) => v.availability === 'confirmed');
  const waiting = props.volunteers.filter(
    (v) => v.availability !== 'confirmed',
  );
  const bucket = (
    label: string,
    tone: string,
    members: PrototypeVolunteer[],
  ) => (
    <div>
      <div className={`mb-1.5 font-medium text-xs ${tone}`}>
        {label} · {members.length}
      </div>
      <div className="space-y-1.5">
        {members.map((volunteer) => (
          <DragBox
            key={volunteer.id}
            volunteer={volunteer}
            activeVolunteerId={props.activeVolunteerId}
            selectedVolunteerId={props.selectedVolunteerId}
            onSelect={props.onSelect}
            className="flex w-full items-center gap-2 rounded-lg border p-2.5"
          >
            <span
              className={`size-2 shrink-0 rounded-full ${tone.replace('text-', 'bg-')}`}
            />
            <span className="min-w-0 flex-1 truncate font-medium text-sm">
              {volunteer.name}
            </span>
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {volunteer.team}
            </span>
          </DragBox>
        ))}
      </div>
    </div>
  );
  return (
    <RailFrame
      count={props.volunteers.length}
      subtitle="Grouped by availability."
      {...pick(props)}
    >
      <div className="space-y-4">
        {bucket('Ready to place', 'text-emerald-700', ready)}
        {waiting.length
          ? bucket('Awaiting response', 'text-amber-700', waiting)
          : null}
      </div>
    </RailFrame>
  );
}

// F — Tile grid (2 columns).
function RailF(props: RailVariantProps) {
  return (
    <RailFrame count={props.volunteers.length} {...pick(props)}>
      <div className="grid grid-cols-2 gap-2">
        {props.volunteers.map((volunteer) => (
          <DragBox
            key={volunteer.id}
            volunteer={volunteer}
            activeVolunteerId={props.activeVolunteerId}
            selectedVolunteerId={props.selectedVolunteerId}
            onSelect={props.onSelect}
            className="flex w-full flex-col items-center gap-1.5 rounded-xl border p-3 text-center"
          >
            <InitialsCircle name={volunteer.name} className="size-10" />
            <span className="w-full truncate font-medium text-xs">
              {volunteer.name}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {volunteer.assignments} assignments
            </span>
            <StatusPill availability={volunteer.availability} />
          </DragBox>
        ))}
      </div>
    </RailFrame>
  );
}

// G — Dense table.
function RailG(props: RailVariantProps) {
  return (
    <RailFrame count={props.volunteers.length} {...pick(props)}>
      <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-border border-b pb-1.5 text-[10px] text-muted-foreground uppercase tracking-wide">
        <span>Name / team</span>
        <span className="text-right">Load</span>
      </div>
      <div className="divide-y divide-border">
        {props.volunteers.map((volunteer) => (
          <DragBox
            key={volunteer.id}
            volunteer={volunteer}
            activeVolunteerId={props.activeVolunteerId}
            selectedVolunteerId={props.selectedVolunteerId}
            onSelect={props.onSelect}
            idleClassName="hover:bg-muted/50"
            activeClassName="bg-primary/8"
            className="grid w-full grid-cols-[1fr_auto] items-center gap-x-3 rounded-sm px-1 py-2"
          >
            <span className="min-w-0">
              <span className="block truncate font-medium text-xs">
                {volunteer.name}
              </span>
              <span className="block text-[10px] text-muted-foreground">
                {volunteer.team} · {AVAILABILITY_LABELS[volunteer.availability]}
              </span>
            </span>
            <span className="text-right font-semibold text-xs tabular-nums">
              {volunteer.assignments}
            </span>
          </DragBox>
        ))}
      </div>
    </RailFrame>
  );
}

// H — Filter chips + compact rows (local filter state).
function RailH(props: RailVariantProps) {
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'needs-response'>(
    'all',
  );
  const filtered = props.volunteers.filter((v) =>
    filter === 'all' ? true : v.availability === filter,
  );
  const chips: Array<{ key: typeof filter; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'confirmed', label: 'Confirmed' },
    { key: 'needs-response', label: 'Needs response' },
  ];
  return (
    <RailFrame count={filtered.length} {...pick(props)}>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <Button
            key={chip.key}
            type="button"
            size="sm"
            variant={filter === chip.key ? 'secondary' : 'ghost'}
            onClick={() => setFilter(chip.key)}
          >
            {chip.label}
          </Button>
        ))}
      </div>
      <div className="space-y-1.5">
        {filtered.map((volunteer) => (
          <DragBox
            key={volunteer.id}
            volunteer={volunteer}
            activeVolunteerId={props.activeVolunteerId}
            selectedVolunteerId={props.selectedVolunteerId}
            onSelect={props.onSelect}
            className="flex w-full items-center gap-2 rounded-lg border p-2.5"
          >
            <GripVerticalIcon className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate font-medium text-sm">
              {volunteer.name}
            </span>
            <StatusPill availability={volunteer.availability} />
          </DragBox>
        ))}
      </div>
    </RailFrame>
  );
}

// I — Bench by recency (coldest first), recency emphasized.
function RailI(props: RailVariantProps) {
  const byRecency = [...props.volunteers].sort(
    (a, b) => weeksAgo(b.lastServed) - weeksAgo(a.lastServed),
  );
  return (
    <RailFrame
      count={props.volunteers.length}
      subtitle="Coldest bench first — longest since last served."
      {...pick(props)}
    >
      <div className="space-y-2">
        {byRecency.map((volunteer, index) => (
          <DragBox
            key={volunteer.id}
            volunteer={volunteer}
            activeVolunteerId={props.activeVolunteerId}
            selectedVolunteerId={props.selectedVolunteerId}
            onSelect={props.onSelect}
            className="flex w-full items-center gap-3 rounded-lg border p-3"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-sm">
                {volunteer.name}
              </span>
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <ClockIcon className="size-3" />
                last served {volunteer.lastServed}
              </span>
            </span>
            {index === 0 ? (
              <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] text-orange-700">
                <FlameIcon className="size-3" /> Coldest
              </span>
            ) : (
              <StatusPill availability={volunteer.availability} />
            )}
          </DragBox>
        ))}
      </div>
    </RailFrame>
  );
}

// J — Compact tokens (flex-wrapped pills).
function RailJ(props: RailVariantProps) {
  return (
    <RailFrame
      count={props.volunteers.length}
      subtitle="Compact tokens — drag a chip onto a role."
      {...pick(props)}
    >
      <div className="flex flex-wrap gap-2">
        {props.volunteers.map((volunteer) => (
          <DragBox
            key={volunteer.id}
            volunteer={volunteer}
            activeVolunteerId={props.activeVolunteerId}
            selectedVolunteerId={props.selectedVolunteerId}
            onSelect={props.onSelect}
            idleClassName="border-border hover:border-primary/60"
            className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5"
          >
            <InitialsCircle
              name={volunteer.name}
              className="size-5 text-[9px]"
            />
            <span className="font-medium text-xs">{volunteer.name}</span>
            <span
              className={`size-1.5 rounded-full ${volunteer.availability === 'confirmed' ? 'bg-emerald-500' : 'bg-amber-500'}`}
            />
          </DragBox>
        ))}
      </div>
    </RailFrame>
  );
}

// =============================================================================
// EXTRA VARIANTS (K..AD) — recombinations of the A..J building blocks.
// Same primitives (avatar, load meter, status pill, grip, rank badge, next-up /
// coldest tags, team / status grouping, tiles, table, tokens, filter chips,
// recency), mixed into new layouts. Nothing new invented; just reassembled.
// =============================================================================

// Shared list renderer to keep the recombinations terse.
function CardList({
  base,
  items,
  className,
  idleClassName,
  activeClassName,
  render,
}: {
  base: RailVariantProps;
  items: PrototypeVolunteer[];
  className: string;
  idleClassName?: string;
  activeClassName?: string;
  render: (volunteer: PrototypeVolunteer, index: number) => ReactNode;
}) {
  return (
    <>
      {items.map((volunteer, index) => (
        <DragBox
          key={volunteer.id}
          volunteer={volunteer}
          activeVolunteerId={base.activeVolunteerId}
          selectedVolunteerId={base.selectedVolunteerId}
          onSelect={base.onSelect}
          className={className}
          idleClassName={idleClassName}
          activeClassName={activeClassName}
        >
          {render(volunteer, index)}
        </DragBox>
      ))}
    </>
  );
}

function RankBadge({ index }: { index: number }) {
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-[10px]">
      {index + 1}
    </span>
  );
}

function useAvailabilityFilter(volunteers: PrototypeVolunteer[]) {
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'needs-response'>(
    'all',
  );
  const filtered = volunteers.filter((volunteer) =>
    filter === 'all' ? true : volunteer.availability === filter,
  );
  return { filter, setFilter, filtered };
}

function FilterChips({
  filter,
  setFilter,
}: {
  filter: 'all' | 'confirmed' | 'needs-response';
  setFilter: (value: 'all' | 'confirmed' | 'needs-response') => void;
}) {
  const chips = [
    { key: 'all', label: 'All' },
    { key: 'confirmed', label: 'Confirmed' },
    { key: 'needs-response', label: 'Needs response' },
  ] as const;
  return (
    <div className="mb-3 flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <Button
          key={chip.key}
          type="button"
          size="sm"
          variant={filter === chip.key ? 'secondary' : 'ghost'}
          onClick={() => setFilter(chip.key)}
        >
          {chip.label}
        </Button>
      ))}
    </div>
  );
}

function byLoad(volunteers: PrototypeVolunteer[]) {
  return [...volunteers].sort((a, b) => a.assignments - b.assignments);
}

function byRecency(volunteers: PrototypeVolunteer[]) {
  return [...volunteers].sort(
    (a, b) => weeksAgo(b.lastServed) - weeksAgo(a.lastServed),
  );
}

// K — rank + avatar + status (C rank ⊕ B avatar ⊕ A status).
function RailK(props: RailVariantProps) {
  return (
    <RailFrame
      count={props.volunteers.length}
      subtitle="Avatar rows, ranked by fairness."
      {...pick(props)}
    >
      <div className="space-y-2">
        <CardList
          base={props}
          items={byLoad(props.volunteers)}
          className="flex w-full items-center gap-3 rounded-lg border p-3"
          render={(volunteer, index) => (
            <>
              <RankBadge index={index} />
              <InitialsCircle name={volunteer.name} className="size-8" />
              <span className="min-w-0 flex-1 truncate font-medium text-sm">
                {volunteer.name}
              </span>
              <StatusPill availability={volunteer.availability} />
            </>
          )}
        />
      </div>
    </RailFrame>
  );
}

// L — avatar tiles + load meter (F tiles ⊕ B meter).
function RailL(props: RailVariantProps) {
  return (
    <RailFrame count={props.volunteers.length} {...pick(props)}>
      <div className="grid grid-cols-2 gap-2">
        <CardList
          base={props}
          items={props.volunteers}
          className="flex w-full flex-col items-center gap-2 rounded-xl border p-3 text-center"
          render={(volunteer) => (
            <>
              <InitialsCircle name={volunteer.name} className="size-10" />
              <span className="w-full truncate font-medium text-xs">
                {volunteer.name}
              </span>
              <LoadMeter assignments={volunteer.assignments} />
            </>
          )}
        />
      </div>
    </RailFrame>
  );
}

// M — grouped by team + load-meter rows (D grouping ⊕ B meter).
function RailM(props: RailVariantProps) {
  return (
    <RailFrame count={props.volunteers.length} {...pick(props)}>
      <div className="space-y-4">
        {groupBy(props.volunteers, (v) => v.team).map(([team, members]) => (
          <div key={team}>
            <div className="mb-1.5 flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wide">
              <LayersIcon className="size-3.5" />
              {team}
              <span className="ml-auto normal-case">{members.length}</span>
            </div>
            <div className="space-y-1.5">
              <CardList
                base={props}
                items={members}
                className="flex w-full flex-col gap-2 rounded-md border p-2.5"
                render={(volunteer) => (
                  <>
                    <span className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate font-medium text-sm">
                        {volunteer.name}
                      </span>
                      <StatusPill availability={volunteer.availability} />
                    </span>
                    <LoadMeter assignments={volunteer.assignments} />
                  </>
                )}
              />
            </div>
          </div>
        ))}
      </div>
    </RailFrame>
  );
}

// N — status buckets + avatar rows (E buckets ⊕ B avatar).
function RailN(props: RailVariantProps) {
  const ready = props.volunteers.filter((v) => v.availability === 'confirmed');
  const waiting = props.volunteers.filter(
    (v) => v.availability !== 'confirmed',
  );
  const bucket = (
    label: string,
    tone: string,
    members: PrototypeVolunteer[],
  ) =>
    members.length ? (
      <div>
        <div className={`mb-1.5 font-medium text-xs ${tone}`}>
          {label} · {members.length}
        </div>
        <div className="space-y-1.5">
          <CardList
            base={props}
            items={members}
            className="flex w-full items-center gap-3 rounded-lg border p-2.5"
            render={(volunteer) => (
              <>
                <InitialsCircle name={volunteer.name} className="size-8" />
                <span className="min-w-0 flex-1 truncate font-medium text-sm">
                  {volunteer.name}
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {volunteer.team}
                </span>
              </>
            )}
          />
        </div>
      </div>
    ) : null;
  return (
    <RailFrame
      count={props.volunteers.length}
      subtitle="Avatars grouped by availability."
      {...pick(props)}
    >
      <div className="space-y-4">
        {bucket('Ready to place', 'text-emerald-700', ready)}
        {bucket('Awaiting response', 'text-amber-700', waiting)}
      </div>
    </RailFrame>
  );
}

// O — table + avatar column (G table ⊕ B avatar).
function RailO(props: RailVariantProps) {
  return (
    <RailFrame count={props.volunteers.length} {...pick(props)}>
      <div className="grid grid-cols-[auto_1fr_auto] gap-x-3 border-border border-b pb-1.5 text-[10px] text-muted-foreground uppercase tracking-wide">
        <span />
        <span>Name / team</span>
        <span className="text-right">Status</span>
      </div>
      <div className="divide-y divide-border">
        <CardList
          base={props}
          items={props.volunteers}
          idleClassName="hover:bg-muted/50"
          activeClassName="bg-primary/8"
          className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-3 rounded-sm px-1 py-2"
          render={(volunteer) => (
            <>
              <InitialsCircle name={volunteer.name} className="size-7" />
              <span className="min-w-0">
                <span className="block truncate font-medium text-xs">
                  {volunteer.name}
                </span>
                <span className="block text-[10px] text-muted-foreground">
                  {volunteer.team}
                </span>
              </span>
              <StatusPill availability={volunteer.availability} />
            </>
          )}
        />
      </div>
    </RailFrame>
  );
}

// P — table + load-meter column (G table ⊕ B meter).
function RailP(props: RailVariantProps) {
  return (
    <RailFrame count={props.volunteers.length} {...pick(props)}>
      <div className="grid grid-cols-[1fr_96px] gap-x-3 border-border border-b pb-1.5 text-[10px] text-muted-foreground uppercase tracking-wide">
        <span>Name / team</span>
        <span className="text-right">Load</span>
      </div>
      <div className="divide-y divide-border">
        <CardList
          base={props}
          items={props.volunteers}
          idleClassName="hover:bg-muted/50"
          activeClassName="bg-primary/8"
          className="grid w-full grid-cols-[1fr_96px] items-center gap-x-3 rounded-sm px-1 py-2"
          render={(volunteer) => (
            <>
              <span className="min-w-0">
                <span className="block truncate font-medium text-xs">
                  {volunteer.name}
                </span>
                <span className="block text-[10px] text-muted-foreground">
                  {volunteer.team}
                </span>
              </span>
              <LoadMeter assignments={volunteer.assignments} />
            </>
          )}
        />
      </div>
    </RailFrame>
  );
}

// Q — richer tokens: avatar + first name + count (J tokens ⊕ B avatar).
function RailQ(props: RailVariantProps) {
  return (
    <RailFrame
      count={props.volunteers.length}
      subtitle="Avatar tokens — drag a chip onto a role."
      {...pick(props)}
    >
      <div className="flex flex-wrap gap-2">
        <CardList
          base={props}
          items={props.volunteers}
          idleClassName="border-border hover:border-primary/60"
          className="inline-flex items-center gap-2 rounded-full border py-1 pr-3 pl-1"
          render={(volunteer) => (
            <>
              <InitialsCircle name={volunteer.name} className="size-6" />
              <span className="font-medium text-xs">
                {volunteer.name.split(' ')[0]}
              </span>
              <span className="text-[10px] text-muted-foreground">
                ·{volunteer.assignments}
              </span>
            </>
          )}
        />
      </div>
    </RailFrame>
  );
}

// R — leaderboard: rank + avatar + meter (C rank ⊕ B avatar+meter).
function RailR(props: RailVariantProps) {
  return (
    <RailFrame
      count={props.volunteers.length}
      subtitle="Ranked by fairness, with load meter."
      {...pick(props)}
    >
      <div className="space-y-2">
        <CardList
          base={props}
          items={byLoad(props.volunteers)}
          className="flex w-full items-center gap-3 rounded-lg border p-3"
          render={(volunteer, index) => (
            <>
              <RankBadge index={index} />
              <InitialsCircle name={volunteer.name} className="size-8" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-sm">
                  {volunteer.name}
                </span>
                <span className="mt-1 block">
                  <LoadMeter assignments={volunteer.assignments} />
                </span>
              </span>
            </>
          )}
        />
      </div>
    </RailFrame>
  );
}

// S — recency rows + avatar + coldest tag (I recency ⊕ B avatar).
function RailS(props: RailVariantProps) {
  return (
    <RailFrame
      count={props.volunteers.length}
      subtitle="Coldest bench first, with avatars."
      {...pick(props)}
    >
      <div className="space-y-2">
        <CardList
          base={props}
          items={byRecency(props.volunteers)}
          className="flex w-full items-center gap-3 rounded-lg border p-3"
          render={(volunteer, index) => (
            <>
              <InitialsCircle name={volunteer.name} className="size-8" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-sm">
                  {volunteer.name}
                </span>
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <ClockIcon className="size-3" />
                  last served {volunteer.lastServed}
                </span>
              </span>
              {index === 0 ? (
                <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] text-orange-700">
                  <FlameIcon className="size-3" /> Coldest
                </span>
              ) : null}
            </>
          )}
        />
      </div>
    </RailFrame>
  );
}

// T — filter chips + avatar rows (H chips ⊕ B avatar).
function RailT(props: RailVariantProps) {
  const { filter, setFilter, filtered } = useAvailabilityFilter(
    props.volunteers,
  );
  return (
    <RailFrame count={filtered.length} {...pick(props)}>
      <FilterChips filter={filter} setFilter={setFilter} />
      <div className="space-y-1.5">
        <CardList
          base={props}
          items={filtered}
          className="flex w-full items-center gap-3 rounded-lg border p-2.5"
          render={(volunteer) => (
            <>
              <InitialsCircle name={volunteer.name} className="size-8" />
              <span className="min-w-0 flex-1 truncate font-medium text-sm">
                {volunteer.name}
              </span>
              <StatusPill availability={volunteer.availability} />
            </>
          )}
        />
      </div>
    </RailFrame>
  );
}

// U — filter chips + tile grid (H chips ⊕ F tiles).
function RailU(props: RailVariantProps) {
  const { filter, setFilter, filtered } = useAvailabilityFilter(
    props.volunteers,
  );
  return (
    <RailFrame count={filtered.length} {...pick(props)}>
      <FilterChips filter={filter} setFilter={setFilter} />
      <div className="grid grid-cols-2 gap-2">
        <CardList
          base={props}
          items={filtered}
          className="flex w-full flex-col items-center gap-1.5 rounded-xl border p-3 text-center"
          render={(volunteer) => (
            <>
              <InitialsCircle name={volunteer.name} className="size-10" />
              <span className="w-full truncate font-medium text-xs">
                {volunteer.name}
              </span>
              <StatusPill availability={volunteer.availability} />
            </>
          )}
        />
      </div>
    </RailFrame>
  );
}

// V — grouped by team + tiles (D grouping ⊕ F tiles).
function RailV(props: RailVariantProps) {
  return (
    <RailFrame count={props.volunteers.length} {...pick(props)}>
      <div className="space-y-4">
        {groupBy(props.volunteers, (v) => v.team).map(([team, members]) => (
          <div key={team}>
            <div className="mb-1.5 flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wide">
              <LayersIcon className="size-3.5" />
              {team}
              <span className="ml-auto normal-case">{members.length}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <CardList
                base={props}
                items={members}
                className="flex w-full flex-col items-center gap-1.5 rounded-xl border p-3 text-center"
                render={(volunteer) => (
                  <>
                    <InitialsCircle name={volunteer.name} className="size-9" />
                    <span className="w-full truncate font-medium text-xs">
                      {volunteer.name.split(' ')[0]}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {volunteer.assignments}×
                    </span>
                  </>
                )}
              />
            </div>
          </div>
        ))}
      </div>
    </RailFrame>
  );
}

// W — status buckets + load-meter rows (E buckets ⊕ B meter).
function RailW(props: RailVariantProps) {
  const ready = props.volunteers.filter((v) => v.availability === 'confirmed');
  const waiting = props.volunteers.filter(
    (v) => v.availability !== 'confirmed',
  );
  const bucket = (
    label: string,
    tone: string,
    members: PrototypeVolunteer[],
  ) =>
    members.length ? (
      <div>
        <div className={`mb-1.5 font-medium text-xs ${tone}`}>
          {label} · {members.length}
        </div>
        <div className="space-y-1.5">
          <CardList
            base={props}
            items={members}
            className="flex w-full flex-col gap-2 rounded-lg border p-2.5"
            render={(volunteer) => (
              <>
                <span className="truncate font-medium text-sm">
                  {volunteer.name}
                </span>
                <LoadMeter assignments={volunteer.assignments} />
              </>
            )}
          />
        </div>
      </div>
    ) : null;
  return (
    <RailFrame
      count={props.volunteers.length}
      subtitle="Availability buckets with load meters."
      {...pick(props)}
    >
      <div className="space-y-4">
        {bucket('Ready to place', 'text-emerald-700', ready)}
        {bucket('Awaiting response', 'text-amber-700', waiting)}
      </div>
    </RailFrame>
  );
}

// X — rank + grip + status (C rank ⊕ A grip row).
function RailX(props: RailVariantProps) {
  return (
    <RailFrame
      count={props.volunteers.length}
      subtitle="Grip rows, ranked by fairness."
      {...pick(props)}
    >
      <div className="space-y-2">
        <CardList
          base={props}
          items={byLoad(props.volunteers)}
          className="flex w-full items-center gap-2 rounded-lg border p-3"
          render={(volunteer, index) => (
            <>
              <RankBadge index={index} />
              <GripVerticalIcon className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-sm">
                  {volunteer.name}
                </span>
                <span className="block text-muted-foreground text-xs">
                  {volunteer.team} · {volunteer.assignments} cycle assignments
                </span>
              </span>
              <StatusPill availability={volunteer.availability} />
            </>
          )}
        />
      </div>
    </RailFrame>
  );
}

// Y — avatar + recency subtitle + status (B avatar ⊕ I recency ⊕ A status).
function RailY(props: RailVariantProps) {
  return (
    <RailFrame count={props.volunteers.length} {...pick(props)}>
      <div className="space-y-2">
        <CardList
          base={props}
          items={props.volunteers}
          className="flex w-full items-center gap-3 rounded-xl border p-3"
          render={(volunteer) => (
            <>
              <InitialsCircle name={volunteer.name} className="size-9" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-sm">
                  {volunteer.name}
                </span>
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <ClockIcon className="size-3" />
                  {volunteer.team} · {volunteer.lastServed}
                </span>
              </span>
              <StatusPill availability={volunteer.availability} />
            </>
          )}
        />
      </div>
    </RailFrame>
  );
}

// Z — grouped by team + tokens (D grouping ⊕ J tokens).
function RailZ(props: RailVariantProps) {
  return (
    <RailFrame count={props.volunteers.length} {...pick(props)}>
      <div className="space-y-3">
        {groupBy(props.volunteers, (v) => v.team).map(([team, members]) => (
          <div key={team}>
            <div className="mb-1.5 flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wide">
              <LayersIcon className="size-3.5" />
              {team}
            </div>
            <div className="flex flex-wrap gap-2">
              <CardList
                base={props}
                items={members}
                idleClassName="border-border hover:border-primary/60"
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5"
                render={(volunteer) => (
                  <>
                    <InitialsCircle
                      name={volunteer.name}
                      className="size-5 text-[9px]"
                    />
                    <span className="font-medium text-xs">
                      {volunteer.name.split(' ')[0]}
                    </span>
                  </>
                )}
              />
            </div>
          </div>
        ))}
      </div>
    </RailFrame>
  );
}

// AA — dense table grouped by team (G table ⊕ D grouping).
function RailAA(props: RailVariantProps) {
  return (
    <RailFrame count={props.volunteers.length} {...pick(props)}>
      <div className="space-y-3">
        {groupBy(props.volunteers, (v) => v.team).map(([team, members]) => (
          <div key={team}>
            <div className="mb-1 flex items-center gap-x-3 text-[10px] text-muted-foreground uppercase tracking-wide">
              <LayersIcon className="size-3.5" />
              {team}
              <span className="ml-auto">Load</span>
            </div>
            <div className="divide-y divide-border">
              <CardList
                base={props}
                items={members}
                idleClassName="hover:bg-muted/50"
                activeClassName="bg-primary/8"
                className="grid w-full grid-cols-[1fr_auto] items-center gap-x-3 rounded-sm px-1 py-1.5"
                render={(volunteer) => (
                  <>
                    <span className="truncate font-medium text-xs">
                      {volunteer.name}
                    </span>
                    <span className="font-semibold text-xs tabular-nums">
                      {volunteer.assignments}
                    </span>
                  </>
                )}
              />
            </div>
          </div>
        ))}
      </div>
    </RailFrame>
  );
}

// AB — avatar + load meter + recency line (B avatar+meter ⊕ I recency).
function RailAB(props: RailVariantProps) {
  return (
    <RailFrame count={props.volunteers.length} {...pick(props)}>
      <div className="space-y-2">
        <CardList
          base={props}
          items={props.volunteers}
          className="flex w-full flex-col gap-2 rounded-xl border p-3"
          render={(volunteer) => (
            <>
              <span className="flex items-center gap-3">
                <InitialsCircle name={volunteer.name} className="size-9" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-sm">
                    {volunteer.name}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <ClockIcon className="size-3" />
                    last served {volunteer.lastServed}
                  </span>
                </span>
                <StatusPill availability={volunteer.availability} />
              </span>
              <LoadMeter assignments={volunteer.assignments} />
            </>
          )}
        />
      </div>
    </RailFrame>
  );
}

// AC — tiles + rank badge + next-up / coldest tag (F tiles ⊕ C rank+tags).
function RailAC(props: RailVariantProps) {
  return (
    <RailFrame
      count={props.volunteers.length}
      subtitle="Tiles ranked by fairness."
      {...pick(props)}
    >
      <div className="grid grid-cols-2 gap-2">
        <CardList
          base={props}
          items={byLoad(props.volunteers)}
          className="relative flex w-full flex-col items-center gap-1.5 rounded-xl border p-3 text-center"
          render={(volunteer, index) => (
            <>
              <span className="absolute top-1.5 left-1.5">
                <RankBadge index={index} />
              </span>
              <InitialsCircle name={volunteer.name} className="size-10" />
              <span className="w-full truncate font-medium text-xs">
                {volunteer.name}
              </span>
              {index === 0 ? (
                <span className="flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700">
                  <TrophyIcon className="size-3" /> Next up
                </span>
              ) : (
                <span className="text-[10px] text-muted-foreground">
                  {volunteer.assignments} assignments
                </span>
              )}
            </>
          )}
        />
      </div>
    </RailFrame>
  );
}

// AD — filter chips + leaderboard rank rows (H chips ⊕ C rank).
function RailAD(props: RailVariantProps) {
  const { filter, setFilter, filtered } = useAvailabilityFilter(
    props.volunteers,
  );
  return (
    <RailFrame count={filtered.length} {...pick(props)}>
      <FilterChips filter={filter} setFilter={setFilter} />
      <div className="space-y-2">
        <CardList
          base={props}
          items={byLoad(filtered)}
          className="flex w-full items-center gap-3 rounded-lg border p-3"
          render={(volunteer, index) => (
            <>
              <RankBadge index={index} />
              <span className="min-w-0 flex-1 truncate font-medium text-sm">
                {volunteer.name}
              </span>
              <LoadMeter assignments={volunteer.assignments} />
            </>
          )}
        />
      </div>
    </RailFrame>
  );
}

// --- small helpers -----------------------------------------------------------

function pick(props: RailVariantProps) {
  return { search: props.search, onSearchChange: props.onSearchChange };
}

function groupBy<T>(
  items: T[],
  key: (item: T) => string,
): Array<[string, T[]]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const bucket = map.get(key(item));
    if (bucket) bucket.push(item);
    else map.set(key(item), [item]);
  }
  return [...map.entries()];
}

// --- registry ----------------------------------------------------------------

export const RAIL_VARIANTS: RailVariant[] = [
  { key: 'A', name: 'Refined rows', Rail: RailA, Ghost: RowGhost },
  { key: 'B', name: 'Avatar + load meter', Rail: RailB, Ghost: AvatarGhost },
  { key: 'C', name: 'Fairness leaderboard', Rail: RailC, Ghost: RowGhost },
  { key: 'D', name: 'Grouped by team', Rail: RailD, Ghost: AvatarGhost },
  { key: 'E', name: 'Availability buckets', Rail: RailE, Ghost: RowGhost },
  { key: 'F', name: 'Tile grid', Rail: RailF, Ghost: TileGhost },
  { key: 'G', name: 'Dense table', Rail: RailG, Ghost: RowGhost },
  { key: 'H', name: 'Filter chips + list', Rail: RailH, Ghost: RowGhost },
  { key: 'I', name: 'Bench by recency', Rail: RailI, Ghost: RowGhost },
  { key: 'J', name: 'Compact tokens', Rail: RailJ, Ghost: TokenGhost },
  { key: 'K', name: 'Rank + avatar + status', Rail: RailK, Ghost: AvatarGhost },
  { key: 'L', name: 'Avatar tiles + meter', Rail: RailL, Ghost: TileGhost },
  { key: 'M', name: 'Team groups + meter', Rail: RailM, Ghost: AvatarGhost },
  { key: 'N', name: 'Status groups + avatar', Rail: RailN, Ghost: AvatarGhost },
  { key: 'O', name: 'Table + avatar', Rail: RailO, Ghost: AvatarGhost },
  { key: 'P', name: 'Table + load meter', Rail: RailP, Ghost: RowGhost },
  { key: 'Q', name: 'Avatar tokens', Rail: RailQ, Ghost: TokenGhost },
  {
    key: 'R',
    name: 'Leaderboard + avatar + meter',
    Rail: RailR,
    Ghost: AvatarGhost,
  },
  { key: 'S', name: 'Recency + avatar', Rail: RailS, Ghost: AvatarGhost },
  { key: 'T', name: 'Chips + avatar rows', Rail: RailT, Ghost: AvatarGhost },
  { key: 'U', name: 'Chips + tile grid', Rail: RailU, Ghost: TileGhost },
  { key: 'V', name: 'Team groups + tiles', Rail: RailV, Ghost: TileGhost },
  { key: 'W', name: 'Status groups + meter', Rail: RailW, Ghost: RowGhost },
  { key: 'X', name: 'Rank + grip + status', Rail: RailX, Ghost: RowGhost },
  {
    key: 'Y',
    name: 'Avatar + recency + status',
    Rail: RailY,
    Ghost: AvatarGhost,
  },
  { key: 'Z', name: 'Team groups + tokens', Rail: RailZ, Ghost: TokenGhost },
  { key: 'AA', name: 'Table grouped by team', Rail: RailAA, Ghost: RowGhost },
  {
    key: 'AB',
    name: 'Avatar + meter + recency',
    Rail: RailAB,
    Ghost: AvatarGhost,
  },
  { key: 'AC', name: 'Tiles + rank + tags', Rail: RailAC, Ghost: TileGhost },
  { key: 'AD', name: 'Chips + leaderboard', Rail: RailAD, Ghost: RowGhost },
];

export function railVariant(key: string): RailVariant {
  return (
    RAIL_VARIANTS.find((variant) => variant.key === key) ?? RAIL_VARIANTS[0]
  );
}
