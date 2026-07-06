import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@church/ui/components/card';
import { createFileRoute, Link } from '@tanstack/react-router';
import { CalendarClock, Clock, LayoutDashboard } from 'lucide-react';
import type * as React from 'react';
import { useCallerRoles } from '@/shared/hooks/use-caller-roles';

export const Route = createFileRoute('/')({
  component: HomeComponent,
});

interface LandingCard {
  label: string;
  to: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const BASE_LANDING_CARDS: LandingCard[] = [
  {
    label: 'Dashboard',
    to: '/dashboard',
    description: 'Your upcoming assignments and availability at a glance.',
    icon: LayoutDashboard,
  },
  {
    label: 'Availability',
    to: '/availability',
    description: 'Let leaders know when you can and cannot serve.',
    icon: Clock,
  },
];

const SCHEDULING_LANDING_CARD: LandingCard = {
  label: 'Scheduling',
  to: '/scheduling',
  description: 'Plan cycles, build rosters, and publish assignments.',
  icon: CalendarClock,
};

function HomeComponent() {
  const { canSeeScheduling } = useCallerRoles();
  const cards = canSeeScheduling
    ? [...BASE_LANDING_CARDS, SCHEDULING_LANDING_CARD]
    : BASE_LANDING_CARDS;

  return (
    <div className="workspace-page">
      <div className="workspace-section-header">
        <h1 className="text-balance font-semibold text-3xl tracking-[-0.02em] md:text-4xl">
          Welcome back
        </h1>
        <p className="workspace-section-description">
          Pick up where you left off.
        </p>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.to} to={card.to}>
              <Card className="h-full transition-colors hover:bg-accent">
                <CardHeader>
                  <Icon className="h-5 w-5 text-muted-foreground" />
                  <CardTitle>{card.label}</CardTitle>
                  <CardDescription>{card.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
