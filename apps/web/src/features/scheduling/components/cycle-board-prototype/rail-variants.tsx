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
  SlidersHorizontalIcon,
  StarIcon,
  TrophyIcon,
  UsersRoundIcon,
} from 'lucide-react';
import {
  type ReactElement,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  idealVolunteerId,
  orderVolunteersForSlot,
  type PrototypeSlotContext,
  type PrototypeVolunteer,
} from './prototype-data';
import { useVolunteerDraggable } from './prototype-dnd';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// --- variant contract --------------------------------------------------------

export interface RailVariantProps {
  volunteers: PrototypeVolunteer[];
  selectedVolunteerId: string | null;
  activeVolunteerId: string | null;
  // The board slot currently in focus (date+slot+role), or null for the general
  // fairness list. Only the AE–AI rails consume it; A–AD ignore it.
  selectedSlot: PrototypeSlotContext | null;
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
  action,
  children,
}: {
  count: number;
  subtitle?: string;
  search: string;
  onSearchChange: (value: string) => void;
  showSearch?: boolean;
  action?: ReactNode;
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
        {action}
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
  muted = false,
  children,
}: {
  volunteer: PrototypeVolunteer;
  activeVolunteerId: string | null;
  selectedVolunteerId: string | null;
  onSelect: (id: string) => void;
  className: string;
  activeClassName?: string;
  idleClassName?: string;
  // Slot-aware dimming: unavailable-for-the-selected-slot people stay visible
  // and draggable (override path) but read as de-emphasised.
  muted?: boolean;
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
      className={`${className} ${selected ? activeClassName : idleClassName} ${dimmed ? 'opacity-40' : muted ? 'opacity-55' : ''} cursor-grab text-left active:cursor-grabbing`}
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

// =============================================================================
// AE..AI — availability-aware bidirectional helper rails.
// Same spine for all five: each row = ⋮⋮ drag handle · avatar · "last served N
// weeks ago" recency · this-cycle count · availability · at most one "Ideal"
// badge. A selected slot (props.selectedSlot) reorders by availability and lights
// the Ideal pick; no slot → general fairness list, no badge. A filter/group
// control switches show-all vs group-by-role. The 5 differ only in layout.
// Real-builder seams to port back: recommendations().safe[0] → Ideal;
// eligibleVolunteers(isAvailable/hasConflict) → per-slot availability;
// onFocus/setFocused → selectedSlot.
// =============================================================================

type SlotState = 'available' | 'unavailable' | 'off';

function slotStateOf(
  volunteer: PrototypeVolunteer,
  slot: PrototypeSlotContext | null,
): SlotState {
  if (!slot) return 'off';
  const entry = slot.eligibility[volunteer.id];
  if (entry?.isAvailable && !entry.hasConflict) return 'available';
  return 'unavailable';
}

function orderRail(
  volunteers: PrototypeVolunteer[],
  slot: PrototypeSlotContext | null,
): PrototypeVolunteer[] {
  return slot ? orderVolunteersForSlot(volunteers, slot) : volunteers;
}

function idealFor(props: RailVariantProps): string | null {
  return props.selectedSlot
    ? idealVolunteerId(props.selectedSlot, props.volunteers)
    : null;
}

function roleGroups(
  volunteers: PrototypeVolunteer[],
): Array<[string, PrototypeVolunteer[]]> {
  const map = new Map<string, PrototypeVolunteer[]>();
  for (const volunteer of volunteers) {
    for (const role of volunteer.roles) {
      const bucket = map.get(role);
      if (bucket) bucket.push(volunteer);
      else map.set(role, [volunteer]);
    }
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function IdealBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 font-medium text-[10px] text-primary">
      <StarIcon className="size-3" /> Ideal
    </span>
  );
}

// Availability read-out: cycle status when no slot is selected, slot-specific
// availability once a slot is in focus.
function AvailabilityTag({
  volunteer,
  slot,
}: {
  volunteer: PrototypeVolunteer;
  slot: PrototypeSlotContext | null;
}) {
  const state = slotStateOf(volunteer, slot);
  if (state === 'off')
    return <StatusPill availability={volunteer.availability} />;
  return (
    <span
      className={`shrink-0 text-[11px] ${state === 'available' ? 'text-emerald-700' : 'text-muted-foreground'}`}
    >
      {state === 'available' ? 'Available' : 'Unavailable'}
    </span>
  );
}

// Two separate facts. They sit on one line when they fit and break to a line
// each when they don't — never mid-phrase — and the clock stays pinned to the
// first line rather than floating in the middle of wrapped text.
function RecencyMeta({ volunteer }: { volunteer: PrototypeVolunteer }) {
  return (
    <span className="mt-auto flex items-start gap-1.5 pt-1.5 text-[11px] text-muted-foreground">
      <ClockIcon className="mt-0.5 size-3 shrink-0" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate">last served {volunteer.lastServed}</span>
        <span className="truncate">{volunteer.assignments} this cycle</span>
      </span>
    </span>
  );
}

// True only when the element's text is actually clipped. Measured, not guessed,
// so the roles tooltip appears for someone like Ana Costa (3 roles, "Room lead"
// clipped) and stays out of the way for people whose roles already fit.
function useIsTruncated<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [truncated, setTruncated] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const check = () => setTruncated(element.scrollWidth > element.clientWidth);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, truncated };
}

// Roles line. The card is no longer clickable or draggable, so when the list
// overflows, hovering reveals the full set — the leader can read someone's roles
// without opening the volunteer or leaving the page.
function RolesLine({ volunteer }: { volunteer: PrototypeVolunteer }) {
  const { ref, truncated } = useIsTruncated<HTMLSpanElement>();
  const label = volunteer.roles.join(' · ');
  const line = (
    <span
      ref={ref}
      className="block truncate text-[11px] text-muted-foreground"
    >
      {label}
    </span>
  );
  if (!truncated) return line;
  return (
    <Tooltip>
      <TooltipTrigger render={line} />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

// Filter icon → show-all vs group-by-role. Local disclosure, extensible to more
// options. All AE–AI mount it; AG defaults to grouped.
function GroupControl({
  grouped,
  onChange,
}: {
  grouped: boolean;
  onChange: (value: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const options: Array<{ value: boolean; label: string }> = [
    { value: false, label: 'Show all' },
    { value: true, label: 'Group by role' },
  ];
  return (
    <div className="relative">
      <Button
        type="button"
        size="icon-sm"
        variant={grouped ? 'secondary' : 'ghost'}
        aria-label="Filter and group"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <SlidersHorizontalIcon className="size-4" />
      </Button>
      {open ? (
        <div className="absolute right-0 z-20 mt-1 w-40 rounded-md border border-border bg-popover p-1 shadow-md">
          {options.map((option) => (
            <button
              key={option.label}
              type="button"
              data-active={option.value === grouped}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted data-[active=true]:font-medium data-[active=true]:text-primary"
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// Select-slot toggle — the ONLY select trigger (the card body is drag-only, per
// the real builder's volunteer-card.tsx). Click selects the volunteer (lights
// the board cells they fit); click again deselects. Sized for comfortable
// targets (older-adult audience), never a cramped micro-button.
function SelectSlotButton({
  props,
  volunteer,
  className = '',
}: {
  props: RailVariantProps;
  volunteer: PrototypeVolunteer;
  className?: string;
}) {
  const selected = props.selectedVolunteerId === volunteer.id;
  return (
    <Button
      type="button"
      size="sm"
      variant={selected ? 'secondary' : 'ghost'}
      aria-pressed={selected}
      className={`h-6 shrink-0 px-2 text-[11px] ${className}`}
      onClick={() => props.onSelect(volunteer.id)}
    >
      {selected ? 'Selected' : 'Select slot'}
    </Button>
  );
}

// Compact "Ideal" marker for dense rows — the labelled IdealBadge is used in the
// roomy rails; this star carries the same meaning where space is tight.
function IdealStar() {
  return (
    <StarIcon
      className="size-4 shrink-0 fill-primary text-primary"
      aria-label="Ideal pick"
    />
  );
}

// Compact availability marker: a status dot with an accessible label. Reflects
// the selected slot when one is focused, else the cycle availability.
function AvailabilityDot({
  volunteer,
  slot,
}: {
  volunteer: PrototypeVolunteer;
  slot: PrototypeSlotContext | null;
}) {
  const state = slotStateOf(volunteer, slot);
  let tone = 'bg-muted-foreground/40';
  let label = 'Unavailable';
  if (state === 'off') {
    label = AVAILABILITY_LABELS[volunteer.availability];
    tone =
      volunteer.availability === 'confirmed'
        ? 'bg-emerald-500'
        : volunteer.availability === 'conflict'
          ? 'bg-red-500'
          : 'bg-amber-500';
  } else if (state === 'available') {
    tone = 'bg-emerald-500';
    label = 'Available';
  }
  return (
    <span
      role="img"
      className={`size-2.5 shrink-0 rounded-full ${tone}`}
      title={label}
      aria-label={label}
    />
  );
}

function railRowState(props: RailVariantProps, volunteer: PrototypeVolunteer) {
  const selected = props.selectedVolunteerId === volunteer.id;
  const muted = slotStateOf(volunteer, props.selectedSlot) === 'unavailable';
  return { selected, muted };
}

function railRowClass(
  state: { selected: boolean; muted: boolean },
  dimmed: boolean,
  tone: 'default' | 'leader',
) {
  const base =
    tone === 'leader' && !state.selected
      ? 'border-primary/60 bg-primary/[0.06]'
      : state.selected
        ? 'border-primary bg-primary/8'
        : 'border-border';
  const opacity = dimmed ? 'opacity-40' : state.muted ? 'opacity-55' : '';
  return `${base} ${opacity}`;
}

// Roomy row: avatar + name/meta draggable on the left; a right rail stacks the
// availability tag above the Select-slot button so nothing fights for the same
// horizontal band in a ~320px sidebar. Used by AE and AH.
function RailRow({
  props,
  volunteer,
  tone = 'default',
  avatar,
  aside,
  children,
}: {
  props: RailVariantProps;
  volunteer: PrototypeVolunteer;
  tone?: 'default' | 'leader';
  avatar?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const { setNodeRef, listeners, attributes, isDragging } =
    useVolunteerDraggable(volunteer);
  const state = railRowState(props, volunteer);
  const dimmed = isDragging || props.activeVolunteerId === volunteer.id;
  return (
    <div
      className={`flex items-stretch gap-3 rounded-lg border p-3 ${railRowClass(state, dimmed, tone)}`}
    >
      {/* Avatar top-left, grip bottom-left — the grip fills the dead space
          under the avatar instead of pushing every column to the right. */}
      <div className="flex shrink-0 flex-col items-start justify-between gap-2">
        {avatar}
        {/* The grip is the ONLY drag affordance — the card body is inert. */}
        <button
          ref={setNodeRef}
          type="button"
          {...listeners}
          {...attributes}
          aria-label={`Drag ${volunteer.name}`}
          className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
        >
          <GripVerticalIcon className="size-4" />
        </button>
      </div>
      <div className="flex min-w-0 flex-1 items-stretch">{children}</div>
      {/* Status top, action bottom — the column spans the card height, so the
          button lands on the last content line instead of adding a row. */}
      <div className="flex shrink-0 flex-col items-end justify-between gap-2">
        {/* Flush to the card's top padding, matching its side padding — the
            11px status and 14px name carry near-identical half-leading, so
            flush already reads as aligned. No nudge. */}
        {aside}
        {/* -mr-2 cancels the button's px-2 so its label shares the status's
            right edge; -mb-1 cancels the h-6 box's leftover space below the
            label so it sits on the last text line, not above it. */}
        <SelectSlotButton
          props={props}
          volunteer={volunteer}
          className="-mr-2 -mb-1"
        />
      </div>
    </div>
  );
}

// Dense single-line row: name + status dot + Select-slot button. Used by the
// grouped (AG) and leader-bench (AI) rails where vertical compactness wins.
function CompactRow({
  props,
  volunteer,
  isIdeal,
}: {
  props: RailVariantProps;
  volunteer: PrototypeVolunteer;
  isIdeal: boolean;
}) {
  const { setNodeRef, listeners, attributes, isDragging } =
    useVolunteerDraggable(volunteer);
  const state = railRowState(props, volunteer);
  const dimmed = isDragging || props.activeVolunteerId === volunteer.id;
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border p-2 ${railRowClass(state, dimmed, 'default')}`}
    >
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        className="flex min-w-0 flex-1 cursor-grab items-center gap-2 text-left active:cursor-grabbing"
      >
        <InitialsCircle name={volunteer.name} className="size-8" />
        <span className="min-w-0 flex-1 truncate font-medium text-sm">
          {volunteer.name}
        </span>
        {isIdeal ? <IdealStar /> : null}
      </div>
      <AvailabilityDot volunteer={volunteer} slot={props.selectedSlot} />
      <SelectSlotButton props={props} volunteer={volunteer} />
    </div>
  );
}

function RoleGroupHeader({ role, count }: { role: string; count: number }) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wide">
      <LayersIcon className="size-3.5" />
      {role}
      <span className="ml-auto normal-case">{count}</span>
    </div>
  );
}

// AE — rich rows. Canonical bidirectional helper: avatar + name + recency meta,
// with availability and the Select-slot toggle stacked on the right.
function RailAE(props: RailVariantProps) {
  const [grouped, setGrouped] = useState(false);
  const ideal = idealFor(props);
  const row = (volunteer: PrototypeVolunteer) => (
    <RailRow
      key={volunteer.id}
      props={props}
      volunteer={volunteer}
      avatar={<InitialsCircle name={volunteer.name} className="size-10" />}
      aside={
        <AvailabilityTag volunteer={volunteer} slot={props.selectedSlot} />
      }
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1.5">
          <span className="min-w-0 truncate font-medium text-sm">
            {volunteer.name}
          </span>
          {volunteer.id === ideal ? <IdealBadge /> : null}
        </span>
        <RolesLine volunteer={volunteer} />
        <RecencyMeta volunteer={volunteer} />
      </span>
    </RailRow>
  );
  return (
    <RailFrame
      count={props.volunteers.length}
      subtitle={
        props.selectedSlot
          ? `Filling ${props.selectedSlot.label} — available people first.`
          : 'Select a slot to rank people for it, or drag anyone onto a role.'
      }
      action={<GroupControl grouped={grouped} onChange={setGrouped} />}
      {...pick(props)}
    >
      {grouped ? (
        <div className="space-y-4">
          {roleGroups(props.volunteers).map(([role, members]) => (
            <div key={role}>
              <RoleGroupHeader role={role} count={members.length} />
              <div className="space-y-2">
                {orderRail(members, props.selectedSlot).map(row)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {orderRail(props.volunteers, props.selectedSlot).map(row)}
        </div>
      )}
    </RailFrame>
  );
}

// AF — avatar cards. Column card: draggable header, a recency line, then a
// footer that pairs availability with the Select-slot toggle.
function AvatarRailCard({
  props,
  volunteer,
  isIdeal,
}: {
  props: RailVariantProps;
  volunteer: PrototypeVolunteer;
  isIdeal: boolean;
}) {
  const { setNodeRef, listeners, attributes, isDragging } =
    useVolunteerDraggable(volunteer);
  const state = railRowState(props, volunteer);
  const dimmed = isDragging || props.activeVolunteerId === volunteer.id;
  return (
    <div
      className={`flex w-full flex-col gap-2.5 rounded-xl border p-3 ${railRowClass(state, dimmed, 'default')}`}
    >
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        className="flex cursor-grab items-center gap-3 active:cursor-grabbing"
      >
        <InitialsCircle name={volunteer.name} className="size-11" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-sm">
            {volunteer.name}
          </span>
          <RolesLine volunteer={volunteer} />
        </span>
        {isIdeal ? <IdealBadge /> : null}
      </div>
      <RecencyMeta volunteer={volunteer} />
      <div className="flex items-center justify-between gap-2 border-border/70 border-t pt-2.5">
        <AvailabilityTag volunteer={volunteer} slot={props.selectedSlot} />
        <SelectSlotButton props={props} volunteer={volunteer} />
      </div>
    </div>
  );
}

function RailAF(props: RailVariantProps) {
  const [grouped, setGrouped] = useState(false);
  const ideal = idealFor(props);
  const card = (volunteer: PrototypeVolunteer) => (
    <AvatarRailCard
      key={volunteer.id}
      props={props}
      volunteer={volunteer}
      isIdeal={volunteer.id === ideal}
    />
  );
  return (
    <RailFrame
      count={props.volunteers.length}
      subtitle="Avatar cards — role coverage, recency, and availability at a glance."
      action={<GroupControl grouped={grouped} onChange={setGrouped} />}
      {...pick(props)}
    >
      {grouped ? (
        <div className="space-y-4">
          {roleGroups(props.volunteers).map(([role, members]) => (
            <div key={role}>
              <RoleGroupHeader role={role} count={members.length} />
              <div className="space-y-2">
                {orderRail(members, props.selectedSlot).map(card)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {orderRail(props.volunteers, props.selectedSlot).map(card)}
        </div>
      )}
    </RailFrame>
  );
}

// AG — grouped-by-role by default. One global Ideal across all groups; dense
// single-line rows so multiple groups stay scannable.
function RailAG(props: RailVariantProps) {
  const [grouped, setGrouped] = useState(true);
  const ideal = idealFor(props);
  const row = (volunteer: PrototypeVolunteer) => (
    <CompactRow
      key={volunteer.id}
      props={props}
      volunteer={volunteer}
      isIdeal={volunteer.id === ideal}
    />
  );
  return (
    <RailFrame
      count={props.volunteers.length}
      subtitle="Grouped by role — one Ideal pick highlighted across groups."
      action={<GroupControl grouped={grouped} onChange={setGrouped} />}
      {...pick(props)}
    >
      {grouped ? (
        <div className="space-y-4">
          {roleGroups(props.volunteers).map(([role, members]) => (
            <div key={role}>
              <RoleGroupHeader role={role} count={members.length} />
              <div className="space-y-1.5">
                {orderRail(members, props.selectedSlot).map(row)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {orderRail(props.volunteers, props.selectedSlot).map(row)}
        </div>
      )}
    </RailFrame>
  );
}

// AH — availability split. Two sections keyed to the selected slot; falls back
// to cycle-availability buckets when no slot is in focus. The section header
// carries availability, so rows drop the per-row tag.
function RailAH(props: RailVariantProps) {
  const [grouped, setGrouped] = useState(false);
  const ideal = idealFor(props);
  const ordered = orderRail(props.volunteers, props.selectedSlot);
  const isReady = (volunteer: PrototypeVolunteer) =>
    props.selectedSlot
      ? slotStateOf(volunteer, props.selectedSlot) === 'available'
      : volunteer.availability === 'confirmed';
  const ready = ordered.filter(isReady);
  const rest = ordered.filter((volunteer) => !isReady(volunteer));
  const row = (volunteer: PrototypeVolunteer) => (
    <RailRow
      key={volunteer.id}
      props={props}
      volunteer={volunteer}
      avatar={<InitialsCircle name={volunteer.name} className="size-10" />}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1.5">
          <span className="min-w-0 truncate font-medium text-sm">
            {volunteer.name}
          </span>
          {volunteer.id === ideal ? <IdealBadge /> : null}
        </span>
        <RecencyMeta volunteer={volunteer} />
      </span>
    </RailRow>
  );
  const section = (
    label: string,
    tone: string,
    members: PrototypeVolunteer[],
  ) =>
    members.length ? (
      <div>
        <div className={`mb-1.5 font-medium text-xs ${tone}`}>
          {label} · {members.length}
        </div>
        <div className="space-y-2">{members.map(row)}</div>
      </div>
    ) : null;
  return (
    <RailFrame
      count={props.volunteers.length}
      subtitle={
        props.selectedSlot
          ? `Split by availability for ${props.selectedSlot.label}.`
          : 'Split by availability — pick a slot to split for it.'
      }
      action={<GroupControl grouped={grouped} onChange={setGrouped} />}
      {...pick(props)}
    >
      <div className="space-y-4">
        {section(
          props.selectedSlot ? 'Available for this slot' : 'Ready to place',
          'text-emerald-700',
          ready,
        )}
        {section(
          props.selectedSlot ? 'Not available' : 'Awaiting response',
          'text-muted-foreground',
          rest,
        )}
      </div>
    </RailFrame>
  );
}

// AI — leader focus. The Ideal pick is promoted to a hero row; everyone else is
// a compact bench below.
function RailAI(props: RailVariantProps) {
  const [grouped, setGrouped] = useState(false);
  const ideal = idealFor(props);
  const ordered = orderRail(props.volunteers, props.selectedSlot);
  const leader = ordered.find((volunteer) => volunteer.id === ideal) ?? null;
  const rest = ordered.filter((volunteer) => volunteer.id !== leader?.id);
  const compact = (volunteer: PrototypeVolunteer) => (
    <CompactRow
      key={volunteer.id}
      props={props}
      volunteer={volunteer}
      isIdeal={false}
    />
  );
  return (
    <RailFrame
      count={props.volunteers.length}
      subtitle="Leader focus — the Ideal pick up top, the bench below."
      action={<GroupControl grouped={grouped} onChange={setGrouped} />}
      {...pick(props)}
    >
      {leader ? (
        <div className="mb-3">
          <RailRow
            props={props}
            volunteer={leader}
            tone="leader"
            avatar={<InitialsCircle name={leader.name} className="size-12" />}
            aside={<IdealBadge />}
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="block truncate font-semibold text-sm">
                {leader.name}
              </span>
              <RecencyMeta volunteer={leader} />
            </span>
          </RailRow>
        </div>
      ) : null}
      <div className="space-y-1.5">{rest.map(compact)}</div>
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
  { key: 'AE', name: 'Helper · rich rows', Rail: RailAE, Ghost: AvatarGhost },
  {
    key: 'AF',
    name: 'Helper · avatar cards',
    Rail: RailAF,
    Ghost: AvatarGhost,
  },
  {
    key: 'AG',
    name: 'Helper · grouped by role',
    Rail: RailAG,
    Ghost: AvatarGhost,
  },
  {
    key: 'AH',
    name: 'Helper · availability split',
    Rail: RailAH,
    Ghost: AvatarGhost,
  },
  {
    key: 'AI',
    name: 'Helper · leader focus',
    Rail: RailAI,
    Ghost: AvatarGhost,
  },
];

export function railVariant(key: string): RailVariant {
  return (
    RAIL_VARIANTS.find((variant) => variant.key === key) ?? RAIL_VARIANTS[0]
  );
}
