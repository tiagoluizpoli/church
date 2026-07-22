export interface PrototypeRole {
  id: string;
  name: string;
  recommendation: string;
  explanation: string;
}

export interface PrototypeShift {
  id: string;
  label: string;
  time: string;
  roles: PrototypeRole[];
}

export interface PrototypeEvent {
  id: string;
  name: string;
  location: string;
  staffedPercent: number;
  shifts: PrototypeShift[];
}

export interface PrototypeDay {
  id: string;
  weekday: string;
  date: string;
  staffedPercent: number;
  events: PrototypeEvent[];
}

export interface PrototypeVolunteer {
  id: string;
  name: string;
  team: string;
  assignments: number;
  availability: 'confirmed' | 'needs-response' | 'conflict';
  lastServed: string;
  // Roles this person can fill — mirrors the real eligibleVolunteers by-role
  // shape. Used by the AE–AI rails to gate the "Ideal" pick and group-by-role.
  roles: string[];
}

// Per-slot availability for one volunteer, fabricated so that selecting a
// different slot changes the rail. Mirrors the real per-shift eligibleVolunteers
// carrying isAvailable / hasConflict.
export interface PrototypeSlotEligibility {
  isAvailable: boolean;
  hasConflict: boolean;
}

// The slot a rail is helping fill (date + slot + role). Selecting a board cell
// builds one of these; a null context means the general fairness list.
export interface PrototypeSlotContext {
  slotId: string;
  roleName: string;
  label: string;
  eligibility: Record<string, PrototypeSlotEligibility>;
}

export const PROTOTYPE_DAYS: PrototypeDay[] = [
  {
    id: 'sun-12',
    weekday: 'Sun',
    date: 'Oct 12',
    staffedPercent: 58,
    events: [
      {
        id: 'morning',
        name: 'Morning Service',
        location: 'Main auditorium',
        staffedPercent: 62,
        shifts: [
          {
            id: 'sun-12-morning',
            label: 'Main',
            time: '10:30–12:30',
            roles: [
              {
                id: 'slides-12',
                name: 'Slides',
                recommendation: 'Ana Costa',
                explanation:
                  'Available · last served 3 weeks ago · 1 assignment',
              },
              {
                id: 'camera-12',
                name: 'Camera',
                recommendation: 'Diego Alves',
                explanation:
                  'Available · last served 4 weeks ago · 1 assignment',
              },
              {
                id: 'sound-12',
                name: 'Sound',
                recommendation: 'Bruno Lima',
                explanation:
                  'Available · last served 2 weeks ago · 2 assignments',
              },
            ],
          },
        ],
      },
      {
        id: 'kids-12',
        name: 'Kids Gathering',
        location: 'Kids hall',
        staffedPercent: 33,
        shifts: [
          {
            id: 'sun-12-kids',
            label: 'Main',
            time: '10:30–12:30',
            roles: [
              {
                id: 'welcome-12',
                name: 'Check-in',
                recommendation: 'Carla Mendes',
                explanation:
                  'Available · last served 5 weeks ago · 0 assignments',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'wed-15',
    weekday: 'Wed',
    date: 'Oct 15',
    staffedPercent: 100,
    events: [
      {
        id: 'midweek-15',
        name: 'Midweek Gathering',
        location: 'Main auditorium',
        staffedPercent: 100,
        shifts: [
          {
            id: 'wed-15-main',
            label: 'Main',
            time: '19:00–21:00',
            roles: [
              {
                id: 'sound-15',
                name: 'Sound',
                recommendation: 'Bruno Lima',
                explanation:
                  'Available · last served 2 weeks ago · 2 assignments',
              },
              {
                id: 'slides-15',
                name: 'Slides',
                recommendation: 'Ana Costa',
                explanation:
                  'Available · last served 3 weeks ago · 1 assignment',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'sun-19',
    weekday: 'Sun',
    date: 'Oct 19',
    staffedPercent: 42,
    events: [
      {
        id: 'kids-19',
        name: 'Kids Gathering',
        location: 'Kids hall',
        staffedPercent: 42,
        shifts: [
          {
            id: 'sun-19-kids',
            label: 'Main',
            time: '10:30–12:30',
            roles: [
              {
                id: 'welcome-19',
                name: 'Check-in',
                recommendation: 'Carla Mendes',
                explanation:
                  'Available · last served 5 weeks ago · 0 assignments',
              },
              {
                id: 'room-19',
                name: 'Room lead',
                recommendation: 'Ana Costa',
                explanation:
                  'Available · already serving 1 non-overlapping shift that day',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'wed-22',
    weekday: 'Wed',
    date: 'Oct 22',
    staffedPercent: 76,
    events: [
      {
        id: 'midweek-22',
        name: 'Midweek Gathering',
        location: 'Main auditorium',
        staffedPercent: 76,
        shifts: [
          {
            id: 'wed-22-main',
            label: 'Main',
            time: '19:00–21:00',
            roles: [
              {
                id: 'sound-22',
                name: 'Sound',
                recommendation: 'Diego Alves',
                explanation:
                  'Available · last served 4 weeks ago · 1 assignment',
              },
              {
                id: 'slides-22',
                name: 'Slides',
                recommendation: 'Carla Mendes',
                explanation: 'Needs response · not recommended automatically',
              },
            ],
          },
        ],
      },
    ],
  },
];

export const PROTOTYPE_VOLUNTEERS: PrototypeVolunteer[] = [
  {
    id: 'carla',
    name: 'Carla Mendes',
    team: 'Welcome',
    assignments: 0,
    availability: 'confirmed',
    lastServed: '5 weeks ago',
    roles: ['Check-in', 'Slides'],
  },
  {
    id: 'ana',
    name: 'Ana Costa',
    team: 'Media',
    assignments: 1,
    availability: 'confirmed',
    lastServed: '3 weeks ago',
    roles: ['Slides', 'Camera', 'Room lead'],
  },
  {
    id: 'diego',
    name: 'Diego Alves',
    team: 'Media',
    assignments: 1,
    availability: 'confirmed',
    lastServed: '4 weeks ago',
    roles: ['Camera', 'Sound'],
  },
  {
    id: 'bruno',
    name: 'Bruno Lima',
    team: 'Media',
    assignments: 2,
    availability: 'confirmed',
    lastServed: '2 weeks ago',
    roles: ['Sound', 'Slides'],
  },
  {
    id: 'elisa',
    name: 'Elisa Souza',
    team: 'Welcome',
    assignments: 0,
    availability: 'needs-response',
    lastServed: '6 weeks ago',
    roles: ['Check-in', 'Room lead'],
  },
];

export const DATE_FILTERS = ['All dates', 'Sundays', 'Wednesdays'] as const;
export type DateFilter = (typeof DATE_FILTERS)[number];

export function statusTone(percent: number): string {
  if (percent === 100) return 'text-emerald-700';
  if (percent >= 50) return 'text-amber-700';
  return 'text-red-700';
}

// --- slot context (per-slot availability + "Ideal" pick) ---------------------

export function lastServedWeeks(volunteer: PrototypeVolunteer): number {
  const match = volunteer.lastServed.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

// Deterministic per-(slot, volunteer) seed so a slot's availability is stable
// across renders but differs slot-to-slot — selecting another slot reshuffles
// the rail exactly like real per-shift eligibility would.
function slotSeed(slotId: string, volunteerId: string): number {
  const key = `${slotId}:${volunteerId}`;
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

// Fit of one volunteer for one slot: null when not eligible by role, otherwise
// the fabricated per-slot availability/conflict. Used both to build a slot's
// full context and to drive the reverse highlight (volunteer → fitting cells).
export function slotFitFor({
  slotId,
  roleName,
  volunteer,
}: {
  slotId: string;
  roleName: string;
  volunteer: PrototypeVolunteer;
}): PrototypeSlotEligibility | null {
  if (!volunteer.roles.includes(roleName)) return null;
  const seed = slotSeed(slotId, volunteer.id);
  return { isAvailable: seed % 3 !== 0, hasConflict: seed % 7 === 0 };
}

// Build the context for a selected slot: only volunteers eligible by role get an
// eligibility entry; their per-slot availability/conflict is fabricated.
export function buildSlotContext({
  slotId,
  roleName,
  label,
  volunteers,
}: {
  slotId: string;
  roleName: string;
  label: string;
  volunteers: PrototypeVolunteer[];
}): PrototypeSlotContext {
  const eligibility: Record<string, PrototypeSlotEligibility> = {};
  for (const volunteer of volunteers) {
    const fit = slotFitFor({ slotId, roleName, volunteer });
    if (fit) eligibility[volunteer.id] = fit;
  }
  return { slotId, roleName, label, eligibility };
}

function isSlotAvailable(
  context: PrototypeSlotContext,
  volunteerId: string,
): boolean {
  const entry = context.eligibility[volunteerId];
  return entry ? entry.isAvailable && !entry.hasConflict : false;
}

// Ordering for a selected slot: available-and-eligible first, then longest since
// served, then lightest cycle load, then name. Mirrors the real
// recommendations() ranking; the first available row is the "Ideal" pick.
export function orderVolunteersForSlot(
  volunteers: PrototypeVolunteer[],
  context: PrototypeSlotContext,
): PrototypeVolunteer[] {
  return [...volunteers].sort((a, b) => {
    const availableA = isSlotAvailable(context, a.id) ? 0 : 1;
    const availableB = isSlotAvailable(context, b.id) ? 0 : 1;
    if (availableA !== availableB) return availableA - availableB;
    const weeksA = lastServedWeeks(a);
    const weeksB = lastServedWeeks(b);
    if (weeksA !== weeksB) return weeksB - weeksA;
    if (a.assignments !== b.assignments) return a.assignments - b.assignments;
    return a.name.localeCompare(b.name);
  });
}

// The single "Ideal" recommendation for a slot: the top-ranked volunteer that is
// actually available for it. Unavailable/conflict people are never Ideal.
export function idealVolunteerId(
  context: PrototypeSlotContext,
  volunteers: PrototypeVolunteer[],
): string | null {
  const eligible = volunteers.filter(
    (volunteer) => context.eligibility[volunteer.id],
  );
  const ranked = orderVolunteersForSlot(eligible, context);
  const top = ranked.find((volunteer) =>
    isSlotAvailable(context, volunteer.id),
  );
  return top?.id ?? null;
}
