import { createFileRoute } from '@tanstack/react-router';
import { AvailabilityForm } from '@/features/volunteers/components/availability-form';

export const Route = createFileRoute('/availability')({
  component: AvailabilityPage,
});

function AvailabilityPage() {
  return (
    <div className="container mx-auto py-10">
      <AvailabilityForm />
    </div>
  );
}
