import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  ArrowLeftRightIcon,
  CheckIcon,
  FilterIcon,
  LocateFixed,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  DATE_FILTERS,
  type DateFilter,
  PROTOTYPE_DAYS,
  PROTOTYPE_VOLUNTEERS,
  type PrototypeRole,
  type PrototypeShift,
  type PrototypeVolunteer,
} from './prototype-data';
import { DroppableRole } from './prototype-dnd';
import { PrototypeSwitcher } from './prototype-switcher';
import { RAIL_VARIANTS, railVariant } from './rail-variants';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface PendingAssignment {
  role: PrototypeRole;
  shift: PrototypeShift;
  volunteer: PrototypeVolunteer;
}

interface CycleBoardPrototypeProps {
  variantKey: string;
  onVariantChange: (key: string) => void;
}

function matchesDateFilter(weekday: string, filter: DateFilter): boolean {
  if (filter === 'All dates') return true;
  return filter === 'Sundays' ? weekday === 'Sun' : weekday === 'Wed';
}

// Same green/amber/destructive staffing palette the real builder date strip
// uses (cycle-builder-matrix.tsx staffingStatusClasses), copied so the mock
// date cards read identically.
function staffingPalette(percent: number): { text: string; bar: string } {
  if (percent >= 100)
    return { text: 'text-green-700 dark:text-green-400', bar: 'bg-green-600' };
  if (percent >= 50)
    return {
      text: 'text-yellow-700 dark:text-yellow-300',
      bar: 'bg-yellow-500',
    };
  return { text: 'text-destructive', bar: 'bg-destructive' };
}

export function CycleBoardPrototype({
  variantKey,
  onVariantChange,
}: CycleBoardPrototypeProps) {
  const variant = railVariant(variantKey);
  const [activeVolunteer, setActiveVolunteer] =
    useState<PrototypeVolunteer | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const [dateFilter, setDateFilter] = useState<DateFilter>('All dates');
  const [search, setSearch] = useState('');
  const [selectedVolunteerId, setSelectedVolunteerId] = useState<string | null>(
    null,
  );
  const [pendingAssignment, setPendingAssignment] =
    useState<PendingAssignment | null>(null);
  const visibleDays = useMemo(
    () =>
      PROTOTYPE_DAYS.filter((day) =>
        matchesDateFilter(day.weekday, dateFilter),
      ),
    [dateFilter],
  );
  const visibleVolunteers = useMemo(
    () =>
      PROTOTYPE_VOLUNTEERS.filter((volunteer) =>
        `${volunteer.name} ${volunteer.team}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [search],
  );
  const selectedVolunteer = PROTOTYPE_VOLUNTEERS.find(
    (volunteer) => volunteer.id === selectedVolunteerId,
  );
  const chooseRole = (
    role: PrototypeRole,
    shift: PrototypeShift,
    volunteer: PrototypeVolunteer | undefined = selectedVolunteer,
  ) => {
    if (volunteer) setPendingAssignment({ role, shift, volunteer });
  };

  const onDragStart = (event: DragStartEvent) => {
    const volunteer = event.active.data.current?.volunteer as
      | PrototypeVolunteer
      | undefined;
    if (volunteer) {
      setActiveVolunteer(volunteer);
      setSelectedVolunteerId(volunteer.id);
    }
  };
  const onDragEnd = (event: DragEndEvent) => {
    const volunteer = event.active.data.current?.volunteer as
      | PrototypeVolunteer
      | undefined;
    const target = event.over?.data.current as
      | { role: PrototypeRole; shift: PrototypeShift }
      | undefined;
    if (volunteer && target) chooseRole(target.role, target.shift, volunteer);
    setActiveVolunteer(null);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveVolunteer(null)}
    >
      <div className="space-y-5" data-testid="cycle-board-prototype">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-semibold text-primary text-xs uppercase tracking-[0.16em]">
              Prototype · Cycle board
            </p>
            <h1 className="mt-2 font-semibold text-2xl tracking-tight">
              Map the cycle, then place with confidence
            </h1>
            <p className="mt-1 max-w-3xl text-muted-foreground text-sm">
              A full-cycle staffing view with compact date progress, event
              lanes, shift-level recommendations, and a searchable volunteer
              rail.
            </p>
          </div>
          <Button size="lg">Publish cycle</Button>
        </header>

        <section className="flex flex-wrap items-center gap-2 border-border border-b pb-3">
          <FilterIcon className="size-4 text-muted-foreground" />
          <span className="mr-1 font-medium text-sm">Show</span>
          {DATE_FILTERS.map((filter) => (
            <Button
              key={filter}
              type="button"
              size="sm"
              variant={filter === dateFilter ? 'secondary' : 'ghost'}
              onClick={() => setDateFilter(filter)}
            >
              {filter}
            </Button>
          ))}
          <span className="ml-auto text-muted-foreground text-xs">
            {visibleDays.length} of {PROTOTYPE_DAYS.length} dates visible
          </span>
        </section>

        <section className="flex gap-2 overflow-x-auto pb-1">
          {PROTOTYPE_DAYS.map((day) => {
            const palette = staffingPalette(day.staffedPercent);
            const active = matchesDateFilter(day.weekday, dateFilter);
            return (
              <button
                key={day.id}
                type="button"
                data-selected={active}
                onClick={() =>
                  setDateFilter(
                    day.weekday === 'Sun' ? 'Sundays' : 'Wednesdays',
                  )
                }
                className="relative min-w-48 flex-1 rounded-lg border border-border bg-card p-3 text-left data-[selected=true]:border-primary data-[selected=true]:bg-primary/5"
              >
                <span className="flex items-center justify-between font-semibold text-sm">
                  <span className="flex items-center gap-1.5">
                    {day.weekday} · {day.date}
                    <LocateFixed className="size-3.5 text-muted-foreground" />
                  </span>
                  <span className={`text-xs ${palette.text}`}>
                    {day.staffedPercent}%
                  </span>
                </span>
                <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted">
                  <span
                    className={`block h-full ${palette.bar}`}
                    style={{ width: `${day.staffedPercent}%` }}
                  />
                </span>
                <span className="mt-2 block text-muted-foreground text-xs">
                  {day.events.length} event{day.events.length === 1 ? '' : 's'}{' '}
                  · staffing progress
                </span>
              </button>
            );
          })}
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <main className="min-w-0 overflow-x-auto pb-3">
            <div className="min-w-[960px]">
              <div
                className="grid items-start gap-3 text-xs"
                style={{
                  gridTemplateColumns: `repeat(${Math.max(visibleDays.length, 1)}, minmax(320px, 1fr))`,
                }}
              >
                {visibleDays.map((day) => (
                  <section
                    key={day.id}
                    className="min-w-0 self-start rounded-md border bg-card"
                  >
                    <header className="border-b px-3 py-2">
                      <p className="font-semibold text-foreground text-sm">
                        {day.weekday} · {day.date}
                      </p>
                      <p className="mt-0.5 text-muted-foreground text-xs">
                        {day.events.length} event
                        {day.events.length === 1 ? '' : 's'}
                      </p>
                    </header>
                    <div className="space-y-3 p-2">
                      {day.events.map((event) => (
                        <section key={event.id} className="space-y-2">
                          <div className="flex items-center justify-between gap-2 px-1">
                            <h2 className="truncate font-semibold text-foreground text-sm">
                              {event.name}
                            </h2>
                            <Badge variant="outline" className="shrink-0">
                              {event.staffedPercent}%
                            </Badge>
                          </div>
                          {event.shifts.map((shift) => (
                            <section
                              key={shift.id}
                              className="space-y-2 rounded-md border border-dashed p-2"
                            >
                              <h3 className="font-medium text-foreground text-xs">
                                {shift.label}
                              </h3>
                              <section className="space-y-2">
                                <p className="text-muted-foreground text-xs">
                                  {shift.time}
                                </p>
                                <div className="space-y-2">
                                  {shift.roles.map((role) => (
                                    <DroppableRole
                                      key={role.id}
                                      role={role}
                                      shift={shift}
                                      activeVolunteer={activeVolunteer}
                                      onAssign={chooseRole}
                                    />
                                  ))}
                                </div>
                              </section>
                            </section>
                          ))}
                        </section>
                      ))}
                      {day.events.length === 0 ? (
                        <p className="px-1 py-4 text-muted-foreground text-xs">
                          No events
                        </p>
                      ) : null}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </main>
          <variant.Rail
            volunteers={visibleVolunteers}
            selectedVolunteerId={selectedVolunteerId}
            activeVolunteerId={activeVolunteer?.id ?? null}
            search={search}
            onSearchChange={setSearch}
            onSelect={setSelectedVolunteerId}
          />
        </div>

        {pendingAssignment ? (
          <div className="sticky bottom-4 z-40 flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-card p-3 shadow-lg">
            <ArrowLeftRightIcon className="size-4 text-primary" />
            <span className="flex-1 text-sm">
              <strong>{pendingAssignment.volunteer.name}</strong> →{' '}
              {pendingAssignment.role.name} · {pendingAssignment.shift.time}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPendingAssignment(null)}
            >
              Swap existing
            </Button>
            <Button size="sm" onClick={() => setPendingAssignment(null)}>
              <CheckIcon />
              Assign in both
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Close assignment actions"
              onClick={() => setPendingAssignment(null)}
            >
              ×
            </Button>
          </div>
        ) : null}

        <PrototypeSwitcher
          variants={RAIL_VARIANTS}
          current={variant.key}
          onChange={onVariantChange}
        />
      </div>
      <DragOverlay dropAnimation={null}>
        {activeVolunteer ? <variant.Ghost volunteer={activeVolunteer} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
