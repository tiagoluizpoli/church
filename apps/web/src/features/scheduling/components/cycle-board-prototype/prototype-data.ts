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
  },
  {
    id: 'ana',
    name: 'Ana Costa',
    team: 'Media',
    assignments: 1,
    availability: 'confirmed',
    lastServed: '3 weeks ago',
  },
  {
    id: 'diego',
    name: 'Diego Alves',
    team: 'Media',
    assignments: 1,
    availability: 'confirmed',
    lastServed: '4 weeks ago',
  },
  {
    id: 'bruno',
    name: 'Bruno Lima',
    team: 'Media',
    assignments: 2,
    availability: 'confirmed',
    lastServed: '2 weeks ago',
  },
  {
    id: 'elisa',
    name: 'Elisa Souza',
    team: 'Welcome',
    assignments: 0,
    availability: 'needs-response',
    lastServed: '6 weeks ago',
  },
];

export const DATE_FILTERS = ['All dates', 'Sundays', 'Wednesdays'] as const;
export type DateFilter = (typeof DATE_FILTERS)[number];

export function statusTone(percent: number): string {
  if (percent === 100) return 'text-emerald-700';
  if (percent >= 50) return 'text-amber-700';
  return 'text-red-700';
}
