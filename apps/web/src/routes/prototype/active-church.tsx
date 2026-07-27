import { createFileRoute } from '@tanstack/react-router';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Building2,
  CalendarClock,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
  UserRound,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { PrototypeSwitcher } from '@/components/prototype-switcher';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';

// RETAINED PROTOTYPE — implementation reference for the Active Church flow.
// Variant C is the accepted selection direction. Keep this route and its
// scenarios until the production flow has been implemented from it.
// Run from the repo root with: bun run dev:web

const VARIANTS = [
  { key: 'A', label: 'Resume context' },
  { key: 'B', label: 'Destination first' },
  { key: 'C', label: 'Compare access' },
  { key: 'D', label: 'Recent first' },
];

const SCENARIOS = [
  { key: 'many', label: 'Needs selection' },
  { key: 'remembered', label: 'Remembered Church' },
  { key: 'one', label: 'One Church' },
  { key: 'zero', label: 'No access' },
  { key: 'deep-link', label: 'Other-Church link' },
  { key: 'revoked', label: 'Church Membership removed' },
  { key: 'non-volunteer', label: 'Member experience' },
];

type VariantKey = 'A' | 'B' | 'C' | 'D';
type ScenarioKey =
  | 'many'
  | 'remembered'
  | 'one'
  | 'zero'
  | 'deep-link'
  | 'revoked'
  | 'non-volunteer';

interface ActiveChurchPrototypeSearch {
  variant: VariantKey;
}

interface ChurchMembership {
  id: string;
  name: string;
  city: string;
  initials: string;
  access: 'ChurchAdmin' | 'Church Member';
  isVolunteer: boolean;
  lastUsed: string;
  nextTask: string;
}

interface ScenarioModel {
  memberships: ChurchMembership[];
  activeChurchId: string | null;
  intendedChurchId: string | null;
  intendedDestination: string;
  destinationLabel: string;
  reason: string;
  removedFromChurchName?: string;
}

interface SelectionVariantProps {
  model: ScenarioModel;
  onSelect: (churchId: string) => void;
}

interface MembershipRowProps {
  church: ChurchMembership;
  onSelect: (churchId: string) => void;
  emphasis?: 'default' | 'recommended';
}

interface ScenarioBarProps {
  scenario: ScenarioKey;
  model: ScenarioModel;
  onScenarioChange: (scenario: ScenarioKey) => void;
  onReset: () => void;
}

interface WorkspacePreviewProps {
  church: ChurchMembership;
  destinationLabel: string;
  intendedDestination: string;
  onReset: () => void;
}

interface MembershipBadgesProps {
  church: ChurchMembership;
}

interface GetAvailableAreasInput {
  church: ChurchMembership;
}

const MEMBERSHIPS: ChurchMembership[] = [
  {
    id: 'central',
    name: 'Igreja Central',
    city: 'São Paulo, SP',
    initials: 'IC',
    access: 'ChurchAdmin',
    isVolunteer: false,
    lastUsed: 'Today at 09:42',
    nextTask: 'Review the August planning cycle',
  },
  {
    id: 'esperanca',
    name: 'Comunidade Esperança',
    city: 'Campinas, SP',
    initials: 'CE',
    access: 'Church Member',
    isVolunteer: true,
    lastUsed: 'Yesterday at 18:10',
    nextTask: 'Confirm your availability for Sunday',
  },
  {
    id: 'graca',
    name: 'Igreja da Graça',
    city: 'Santos, SP',
    initials: 'IG',
    access: 'ChurchAdmin',
    isVolunteer: true,
    lastUsed: 'July 19',
    nextTask: 'Two assignments need attention',
  },
];

function parseVariant(value: unknown): VariantKey {
  return value === 'A' || value === 'B' || value === 'D' ? value : 'C';
}

export const Route = createFileRoute('/prototype/active-church')({
  validateSearch: (search): ActiveChurchPrototypeSearch => ({
    variant: parseVariant(search.variant),
  }),
  component: ActiveChurchPrototype,
});

function getMembership(id: string): ChurchMembership | undefined {
  return MEMBERSHIPS.find((membership) => membership.id === id);
}

function compactMemberships(ids: string[]): ChurchMembership[] {
  return ids.flatMap((id) => {
    const membership = getMembership(id);
    return membership ? [membership] : [];
  });
}

function buildScenarioModel(scenario: ScenarioKey): ScenarioModel {
  switch (scenario) {
    case 'remembered':
      return {
        memberships: MEMBERSHIPS,
        activeChurchId: 'central',
        intendedChurchId: null,
        intendedDestination: '/dashboard',
        destinationLabel: 'Dashboard',
        reason:
          'A valid Active Church already exists, so the chooser is skipped.',
      };
    case 'one':
      return {
        memberships: compactMemberships(['esperanca']),
        activeChurchId: 'esperanca',
        intendedChurchId: null,
        intendedDestination: '/scheduling/planning-cycles?view=board#upcoming',
        destinationLabel: 'Upcoming planning cycles',
        reason:
          'The only Church Membership is selected silently before navigation continues.',
      };
    case 'zero':
      return {
        memberships: [],
        activeChurchId: null,
        intendedChurchId: null,
        intendedDestination: '/dashboard',
        destinationLabel: 'Dashboard',
        reason:
          'There is no Church Membership, so the application shell cannot open.',
      };
    case 'deep-link':
      return {
        memberships: MEMBERSHIPS,
        activeChurchId: 'central',
        intendedChurchId: 'esperanca',
        intendedDestination: '/dashboard?section=availability',
        destinationLabel: 'Availability at Comunidade Esperança',
        reason:
          'The link targets another Church. Context must change before Church-scoped data loads.',
      };
    case 'revoked':
      return {
        memberships: compactMemberships(['esperanca', 'graca']),
        activeChurchId: null,
        intendedChurchId: null,
        intendedDestination: '/dashboard',
        destinationLabel: 'Dashboard',
        removedFromChurchName: 'Igreja Central',
        reason:
          'The User’s Church Membership at the former Active Church was removed and two memberships remain.',
      };
    case 'non-volunteer':
      return {
        memberships: compactMemberships(['central']),
        activeChurchId: 'central',
        intendedChurchId: null,
        intendedDestination: '/dashboard',
        destinationLabel: 'Administration dashboard',
        reason:
          'The Church is selected silently and only granted application areas are shown.',
      };
    default:
      return {
        memberships: MEMBERSHIPS,
        activeChurchId: null,
        intendedChurchId: null,
        intendedDestination: '/dashboard',
        destinationLabel: 'Dashboard',
        reason:
          'Several valid memberships exist and there is no Active Church.',
      };
  }
}

function ActiveChurchPrototype() {
  const navigate = Route.useNavigate();
  const { variant } = Route.useSearch();
  const [scenario, setScenario] = useState<ScenarioKey>('many');
  const [selectedChurchId, setSelectedChurchId] = useState<string | null>(null);
  const model = buildScenarioModel(scenario);
  const resolvedChurchId = selectedChurchId ?? model.activeChurchId;
  const resolvedChurch = resolvedChurchId
    ? model.memberships.find((membership) => membership.id === resolvedChurchId)
    : undefined;
  const needsCrossChurchConfirmation =
    scenario === 'deep-link' &&
    selectedChurchId === null &&
    model.intendedChurchId !== model.activeChurchId;

  const setVariant = (nextVariant: string) => {
    navigate({
      search: { variant: parseVariant(nextVariant) },
      replace: true,
    });
  };

  const handleScenarioChange = (nextScenario: ScenarioKey) => {
    setSelectedChurchId(null);
    setScenario(nextScenario);
  };

  return (
    <div className="fixed inset-0 z-[100] overflow-auto bg-background text-foreground">
      <ScenarioBar
        scenario={scenario}
        model={model}
        onScenarioChange={handleScenarioChange}
        onReset={() => setSelectedChurchId(null)}
      />

      <div className="min-h-screen pt-32 pb-28 md:pt-24">
        {model.memberships.length === 0 ? <NoAccessState /> : null}

        {model.memberships.length > 0 && needsCrossChurchConfirmation ? (
          <CrossChurchConfirmation
            model={model}
            onSelect={setSelectedChurchId}
          />
        ) : null}

        {model.memberships.length > 0 &&
        !needsCrossChurchConfirmation &&
        resolvedChurch ? (
          <WorkspacePreview
            church={resolvedChurch}
            destinationLabel={model.destinationLabel}
            intendedDestination={model.intendedDestination}
            onReset={() => {
              setSelectedChurchId(null);
              setScenario('many');
            }}
          />
        ) : null}

        {model.memberships.length > 0 &&
        !needsCrossChurchConfirmation &&
        !resolvedChurch ? (
          <>
            {variant === 'A' ? (
              <ResumeContext model={model} onSelect={setSelectedChurchId} />
            ) : null}
            {variant === 'B' ? (
              <DestinationFirst model={model} onSelect={setSelectedChurchId} />
            ) : null}
            {variant === 'C' ? (
              <CompareAccess model={model} onSelect={setSelectedChurchId} />
            ) : null}
            {variant === 'D' ? (
              <RecentFirst model={model} onSelect={setSelectedChurchId} />
            ) : null}
          </>
        ) : null}
      </div>

      <PrototypeSwitcher
        variants={VARIANTS}
        current={variant}
        onChange={setVariant}
      />
    </div>
  );
}

function ScenarioBar({
  scenario,
  model,
  onScenarioChange,
  onReset,
}: ScenarioBarProps) {
  return (
    <aside className="fixed inset-x-0 top-0 z-[110] border-slate-700 border-b bg-slate-950 px-4 py-3 text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <Badge className="shrink-0 border-blue-300/25 bg-blue-300/15 text-blue-100">
            Prototype
          </Badge>
          <span className="truncate text-slate-300 text-xs">
            Gate result: {model.reason}
          </span>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="shrink-0 text-slate-300 hover:bg-white/10 hover:text-white"
            onClick={onReset}
          >
            Reset
          </Button>
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {SCENARIOS.map((option) => (
            <Button
              key={option.key}
              type="button"
              size="xs"
              variant={scenario === option.key ? 'secondary' : 'ghost'}
              className="shrink-0 text-xs"
              onClick={() => onScenarioChange(option.key as ScenarioKey)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>
    </aside>
  );
}

function ProductMark() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <CalendarClock className="size-5" />
      </div>
      <div>
        <p className="font-semibold text-[1.05rem] tracking-tight">
          Church CRM
        </p>
        <p className="text-muted-foreground text-xs">Scheduling workspace</p>
      </div>
    </div>
  );
}

function SignedInIdentity() {
  return (
    <div className="flex items-center gap-3">
      <Avatar className="size-9 rounded-md after:rounded-md">
        <AvatarFallback className="rounded-md bg-primary/12 font-semibold text-primary">
          TP
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate font-medium text-sm">Tiago Poli</p>
        <p className="truncate text-muted-foreground text-xs">
          tiago@example.com
        </p>
      </div>
    </div>
  );
}

function MembershipBadges({ church }: MembershipBadgesProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge variant="secondary">{church.access}</Badge>
      {church.isVolunteer ? <Badge variant="outline">Scheduling</Badge> : null}
    </div>
  );
}

function getAvailableAreas({ church }: GetAvailableAreasInput): string {
  const areas = [
    church.access === 'ChurchAdmin' ? 'Administration' : null,
    church.isVolunteer ? 'Scheduling' : null,
  ].filter(Boolean);

  return areas.join(' · ') || 'Member home';
}

function MembershipRow({
  church,
  onSelect,
  emphasis = 'default',
}: MembershipRowProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(church.id)}
      className={`group flex min-h-20 w-full items-center gap-4 rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        emphasis === 'recommended'
          ? 'border-primary/35 bg-primary/6 hover:bg-primary/10'
          : 'border-border bg-card hover:border-primary/30 hover:bg-accent'
      }`}
    >
      <Avatar className="size-11 shrink-0 rounded-md after:rounded-md">
        <AvatarFallback className="rounded-md bg-primary/12 font-semibold text-primary">
          {church.initials}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate font-semibold">{church.name}</span>
          {emphasis === 'recommended' ? (
            <Badge variant="outline">Most recent</Badge>
          ) : null}
        </span>
        <span className="mt-1 block text-muted-foreground text-sm">
          {church.city} · {church.lastUsed}
        </span>
        <span className="mt-2 flex flex-wrap gap-1.5">
          <Badge variant="secondary">{church.access}</Badge>
          {church.isVolunteer ? (
            <Badge variant="outline">Scheduling</Badge>
          ) : null}
        </span>
      </span>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
        <ArrowRight className="size-4" />
      </span>
    </button>
  );
}

function GateHeader() {
  return (
    <header className="flex items-center justify-between border-border border-b px-5 py-4 md:px-8">
      <ProductMark />
      <SignedInIdentity />
    </header>
  );
}

function ResumeContext({ model, onSelect }: SelectionVariantProps) {
  return (
    <main className="mx-auto max-w-6xl overflow-hidden rounded-xl border bg-card">
      <GateHeader />
      <div className="grid md:grid-cols-[minmax(15rem,0.75fr)_minmax(24rem,1.25fr)]">
        <section className="border-border border-b bg-sidebar p-6 md:border-r md:border-b-0 md:p-8">
          <Badge variant="secondary">Selection required</Badge>
          <h1 className="mt-5 text-balance font-semibold text-2xl tracking-tight">
            Choose where to continue
          </h1>
          <p className="mt-3 max-w-sm text-pretty text-foreground/75 text-sm leading-6">
            Your account belongs to several Churches. We need an Active Church
            before opening Church-scoped information.
          </p>
          <div className="hidden md:block">
            <Separator className="my-6" />
            <p className="font-medium text-sm">After selection</p>
            <div className="mt-3 flex items-start gap-3 text-sm">
              <LayoutDashboard className="mt-0.5 size-4 shrink-0 text-primary" />
              <div>
                <p className="font-medium">{model.destinationLabel}</p>
                <p className="mt-0.5 text-muted-foreground">
                  Your original destination is preserved.
                </p>
              </div>
            </div>
            <div className="mt-4 flex items-start gap-3 text-sm">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
              <div>
                <p className="font-medium">Verified membership</p>
                <p className="mt-0.5 text-muted-foreground">
                  Permissions and cached data will match the selected Church.
                </p>
              </div>
            </div>
          </div>
        </section>
        <section className="p-5 md:p-8">
          <div className="mb-5">
            <h2 className="font-semibold text-lg">Your Churches</h2>
            <p className="mt-1 text-muted-foreground text-sm">
              This choice becomes your Active Church until you switch or lose
              access.
            </p>
          </div>
          <div className="space-y-3">
            {model.memberships.map((church, index) => (
              <MembershipRow
                key={church.id}
                church={church}
                emphasis={index === 0 ? 'recommended' : 'default'}
                onSelect={onSelect}
              />
            ))}
          </div>
          <div className="mt-6 flex items-center justify-between border-border border-t pt-4">
            <span className="text-muted-foreground text-xs">
              Not seeing a Church? Ask a ChurchAdmin to invite you.
            </span>
            <Button variant="ghost" size="sm">
              <LogOut />
              Sign out
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}

function DestinationFirst({ model, onSelect }: SelectionVariantProps) {
  return (
    <main className="mx-auto max-w-5xl">
      <div className="mb-5 flex items-center justify-between px-2">
        <ProductMark />
        <SignedInIdentity />
      </div>
      <Card className="overflow-hidden">
        <div className="border-border border-b bg-sidebar px-6 py-5">
          <button
            type="button"
            className="mb-5 flex items-center gap-2 text-muted-foreground text-sm hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back to sign in
          </button>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-muted-foreground text-sm">You were opening</p>
              <h1 className="mt-1 text-balance font-semibold text-2xl tracking-tight">
                {model.destinationLabel}
              </h1>
              <p className="mt-2 font-mono text-muted-foreground text-xs">
                {model.intendedDestination}
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-background px-3 py-2 text-sm ring-1 ring-foreground/10">
              <ShieldCheck className="size-4 text-primary" />
              Church context required
            </div>
          </div>
        </div>
        <CardContent className="p-0">
          <div className="px-6 py-5">
            <h2 className="font-semibold text-lg">
              Which Church should open this page?
            </h2>
            <p className="mt-1 text-muted-foreground text-sm">
              We’ll verify access, switch context, and continue automatically.
            </p>
          </div>
          <div className="divide-y border-border border-y">
            {model.memberships.map((church) => (
              <button
                key={church.id}
                type="button"
                onClick={() => onSelect(church.id)}
                className="group flex min-h-24 w-full items-center gap-4 bg-card px-6 py-4 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                <Avatar className="size-11 shrink-0 rounded-md after:rounded-md">
                  <AvatarFallback className="rounded-md bg-primary/12 font-semibold text-primary">
                    {church.initials}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{church.name}</span>
                  <span className="mt-1 block text-muted-foreground text-sm">
                    {church.city}
                  </span>
                </span>
                <span className="hidden sm:block">
                  <MembershipBadges church={church} />
                </span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between px-6 py-4">
            <p className="text-muted-foreground text-xs">
              Your selection is saved for the next visit.
            </p>
            <Button variant="ghost" size="sm">
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

function CompareAccess({ model, onSelect }: SelectionVariantProps) {
  return (
    <main className="mx-auto max-w-7xl overflow-hidden rounded-xl border bg-card">
      <GateHeader />
      {model.removedFromChurchName ? (
        <div className="border-border border-b bg-amber-500/8 px-5 py-4 md:px-8">
          <div className="flex items-start gap-3">
            <CircleAlert className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-400" />
            <div>
              <p className="font-semibold text-sm">
                You no longer have access to {model.removedFromChurchName}
              </p>
              <p className="mt-1 text-foreground/75 text-sm">
                Your Church Membership was removed. Choose another Church to
                continue.
              </p>
            </div>
          </div>
        </div>
      ) : null}
      <section className="px-5 py-6 md:px-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-balance font-semibold text-2xl tracking-tight">
              Select an Active Church
            </h1>
            <p className="mt-2 max-w-2xl text-pretty text-muted-foreground text-sm">
              Access differs by Church. Compare what this account can do before
              continuing to {model.destinationLabel}.
            </p>
          </div>
          <div className="relative w-full md:w-64">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Find a Church" />
          </div>
        </div>
      </section>
      <div className="space-y-3 px-5 pb-6 md:hidden">
        {model.memberships.map((church) => (
          <MembershipRow key={church.id} church={church} onSelect={onSelect} />
        ))}
      </div>
      <div className="hidden overflow-x-auto border-border border-y md:block">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-[minmax(15rem,1.4fr)_minmax(9rem,0.8fr)_minmax(9rem,0.8fr)_minmax(12rem,1fr)_3rem] bg-muted/50 px-8 py-2.5 font-medium text-muted-foreground text-xs">
            <span>Church</span>
            <span>Church access</span>
            <span>Available areas</span>
            <span>Last opened</span>
            <span />
          </div>
          {model.memberships.map((church) => (
            <button
              key={church.id}
              type="button"
              onClick={() => onSelect(church.id)}
              className="grid min-h-20 w-full grid-cols-[minmax(15rem,1.4fr)_minmax(9rem,0.8fr)_minmax(9rem,0.8fr)_minmax(12rem,1fr)_3rem] items-center border-border border-t px-8 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <span className="flex items-center gap-3">
                <Avatar className="size-9 rounded-md after:rounded-md">
                  <AvatarFallback className="rounded-md bg-primary/12 font-semibold text-primary">
                    {church.initials}
                  </AvatarFallback>
                </Avatar>
                <span>
                  <span className="block font-semibold">{church.name}</span>
                  <span className="block text-muted-foreground text-xs">
                    {church.city}
                  </span>
                </span>
              </span>
              <span className="text-sm">{church.access}</span>
              <span className="text-sm">{getAvailableAreas({ church })}</span>
              <span className="text-muted-foreground text-sm">
                {church.lastUsed}
              </span>
              <span className="flex size-8 items-center justify-center rounded-md text-muted-foreground">
                <ArrowRight className="size-4" />
              </span>
            </button>
          ))}
        </div>
      </div>
      <footer className="flex flex-col gap-3 px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between md:px-8">
        <p className="text-muted-foreground">
          Active Church controls every protected request and cached result.
        </p>
        <Button variant="outline" size="sm">
          <LogOut />
          Sign out
        </Button>
      </footer>
    </main>
  );
}

function RecentFirst({ model, onSelect }: SelectionVariantProps) {
  const [recentChurch, ...otherChurches] = model.memberships;

  return (
    <main className="mx-auto max-w-2xl">
      <div className="mb-8 flex items-center justify-between">
        <ProductMark />
        <Button variant="ghost" size="sm">
          <LogOut />
          Sign out
        </Button>
      </div>
      <section>
        <h1 className="text-balance font-semibold text-2xl tracking-tight">
          Welcome back, Tiago
        </h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          Choose a Church to open {model.destinationLabel}. We’ll remember it
          next time.
        </p>
      </section>
      {recentChurch ? (
        <section className="mt-8">
          <h2 className="mb-3 font-medium text-sm">Continue with</h2>
          <button
            type="button"
            onClick={() => onSelect(recentChurch.id)}
            className="group w-full rounded-xl border border-primary/30 bg-primary/6 p-5 text-left transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex items-start gap-4">
              <Avatar className="size-12 shrink-0 rounded-md after:rounded-md">
                <AvatarFallback className="rounded-md bg-primary font-semibold text-primary-foreground">
                  {recentChurch.initials}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-3">
                  <span className="truncate font-semibold text-lg">
                    {recentChurch.name}
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-primary" />
                </span>
                <span className="mt-1 block text-muted-foreground text-sm">
                  {recentChurch.city} · Last opened {recentChurch.lastUsed}
                </span>
                <span className="mt-4 block rounded-lg bg-background/80 px-3 py-2.5 text-sm ring-1 ring-foreground/10">
                  <span className="text-muted-foreground">Next:</span>{' '}
                  {recentChurch.nextTask}
                </span>
              </span>
            </span>
          </button>
        </section>
      ) : null}
      {otherChurches.length > 0 ? (
        <section className="mt-7">
          <h2 className="mb-3 font-medium text-sm">Other Churches</h2>
          <div className="overflow-hidden rounded-xl border bg-card">
            {otherChurches.map((church, index) => (
              <button
                key={church.id}
                type="button"
                onClick={() => onSelect(church.id)}
                className={`group flex min-h-18 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset ${
                  index > 0 ? 'border-border border-t' : ''
                }`}
              >
                <Avatar className="size-10 rounded-md after:rounded-md">
                  <AvatarFallback className="rounded-md bg-primary/12 font-semibold text-primary">
                    {church.initials}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">
                    {church.name}
                  </span>
                  <span className="block text-muted-foreground text-sm">
                    {church.city} · {church.access}
                  </span>
                </span>
                <ArrowRight className="size-4 text-muted-foreground group-hover:text-primary" />
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function CrossChurchConfirmation({ model, onSelect }: SelectionVariantProps) {
  const currentChurch = model.memberships.find(
    (church) => church.id === model.activeChurchId,
  );
  const targetChurch = model.memberships.find(
    (church) => church.id === model.intendedChurchId,
  );

  if (!currentChurch || !targetChurch) {
    return null;
  }

  return (
    <main className="mx-auto max-w-2xl">
      <div className="mb-7 flex items-center justify-between">
        <ProductMark />
        <SignedInIdentity />
      </div>
      <Card>
        <CardContent className="p-6 md:p-8">
          <div className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Building2 className="size-5" />
          </div>
          <h1 className="mt-5 text-balance font-semibold text-2xl tracking-tight">
            This link opens another Church
          </h1>
          <p className="mt-3 text-pretty text-foreground/75 leading-6">
            You’re currently working in <strong>{currentChurch.name}</strong>.
            The requested page belongs to <strong>{targetChurch.name}</strong>.
          </p>
          <div className="my-6 rounded-lg bg-muted/60 p-4">
            <p className="font-medium text-sm">{model.destinationLabel}</p>
            <p className="mt-1 font-mono text-muted-foreground text-xs">
              {model.intendedDestination}
            </p>
          </div>
          <p className="text-muted-foreground text-sm">
            Switching clears Church-scoped cached data before the page opens.
            Your membership will be verified again.
          </p>
          <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline">Stay in {currentChurch.name}</Button>
            <Button onClick={() => onSelect(targetChurch.id)}>
              Switch to {targetChurch.name}
              <ArrowRight />
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

function NoAccessState() {
  return (
    <main className="mx-auto max-w-2xl">
      <div className="mb-8 flex items-center justify-between">
        <ProductMark />
        <SignedInIdentity />
      </div>
      <Card>
        <CardContent className="p-6 text-center md:p-10">
          <div className="mx-auto flex size-12 items-center justify-center rounded-lg bg-muted">
            <CircleAlert className="size-5 text-muted-foreground" />
          </div>
          <h1 className="mt-5 font-semibold text-2xl tracking-tight">
            No Church access yet
          </h1>
          <p className="mx-auto mt-3 max-w-md text-pretty text-muted-foreground leading-6">
            Your account is ready, but it has no Church Membership. Ask a
            ChurchAdmin for an invitation or redeem one sent to your email.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-2 sm:flex-row">
            <Button variant="outline">Check invitation status</Button>
            <Button variant="ghost">
              <LogOut />
              Sign out
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

function WorkspacePreview({
  church,
  destinationLabel,
  intendedDestination,
  onReset,
}: WorkspacePreviewProps) {
  return (
    <main className="mx-auto min-h-[720px] max-w-7xl overflow-hidden rounded-xl border bg-background md:grid md:grid-cols-[15rem_1fr]">
      <aside className="hidden border-sidebar-border border-r bg-sidebar md:flex md:flex-col">
        <div className="border-sidebar-border border-b p-4">
          <ProductMark />
        </div>
        <div className="p-3">
          <button
            type="button"
            onClick={onReset}
            className="flex w-full items-center gap-3 rounded-lg border border-sidebar-border bg-background/70 p-3 text-left hover:bg-sidebar-accent"
          >
            <Avatar className="size-9 rounded-md after:rounded-md">
              <AvatarFallback className="rounded-md bg-primary/12 font-semibold text-primary">
                {church.initials}
              </AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-sm">
                {church.name}
              </span>
              <span className="block text-muted-foreground text-xs">
                Active Church
              </span>
            </span>
            <ChevronDown className="size-4 text-muted-foreground" />
          </button>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-2">
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-lg bg-primary/11 px-3 py-2.5 font-semibold text-primary text-sm"
          >
            <LayoutDashboard className="size-4" />
            Dashboard
          </button>
          {church.isVolunteer ? (
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-foreground/75 text-sm hover:bg-sidebar-accent"
            >
              <Clock3 className="size-4" />
              Availability
            </button>
          ) : null}
          {church.access === 'ChurchAdmin' ? (
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-foreground/75 text-sm hover:bg-sidebar-accent"
            >
              <CalendarClock className="size-4" />
              Scheduling
            </button>
          ) : null}
        </nav>
      </aside>

      <section className="min-w-0">
        <header className="flex h-16 items-center justify-between border-border border-b bg-background px-4 md:px-6">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              size="icon-touch"
              variant="ghost"
              className="md:hidden"
            >
              <Menu />
            </Button>
            <div>
              <p className="font-semibold text-sm">{destinationLabel}</p>
              <p className="hidden font-mono text-muted-foreground text-xs sm:block">
                {intendedDestination}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" size="icon-sm" variant="ghost">
              <Search />
            </Button>
            <Button type="button" size="icon-sm" variant="ghost">
              <Bell />
            </Button>
            <Avatar className="size-9 rounded-md after:rounded-md">
              <AvatarFallback className="rounded-md bg-primary/12 font-semibold text-primary">
                TP
              </AvatarFallback>
            </Avatar>
          </div>
        </header>

        <div className="p-4 md:p-7">
          <div className="flex flex-col gap-4 border-border border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <Badge variant="secondary">
                <Check />
                Context verified
              </Badge>
              <h1 className="mt-3 text-balance font-semibold text-2xl tracking-tight">
                {church.name}
              </h1>
              <p className="mt-2 text-muted-foreground">
                {church.city} · {church.access}
              </p>
            </div>
            <Button variant="outline" onClick={onReset}>
              Switch Church
              <ChevronDown />
            </Button>
          </div>

          <section className="mt-7">
            <h2 className="font-semibold text-lg">Continue your work</h2>
            <p className="mt-1 text-muted-foreground text-sm">
              Church-scoped information loaded only after the context was
              verified.
            </p>
            <div className="mt-4 overflow-hidden rounded-xl border bg-card">
              <div className="flex items-start gap-4 p-5">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  {church.isVolunteer ? (
                    <UserRound className="size-5" />
                  ) : (
                    <ShieldCheck className="size-5" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{church.nextTask}</p>
                  <p className="mt-1 text-pretty text-muted-foreground text-sm">
                    {church.isVolunteer
                      ? 'Scheduling and availability are ready in this Church.'
                      : 'Church administration tools are ready.'}
                  </p>
                </div>
                <Button size="sm">
                  Open
                  <ArrowRight />
                </Button>
              </div>
              <div className="grid border-border border-t bg-muted/30 sm:grid-cols-2">
                <div className="flex items-center gap-3 p-4">
                  <Users className="size-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-sm">{church.access}</p>
                    <p className="text-muted-foreground text-xs">
                      Church Membership
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 border-border border-t p-4 sm:border-t-0 sm:border-l">
                  <UserRound className="size-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-sm">
                      {getAvailableAreas({ church })}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Available areas
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
