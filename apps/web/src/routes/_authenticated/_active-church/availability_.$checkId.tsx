import { createFileRoute } from '@tanstack/react-router';
import { AvailabilityDetailPage } from '@/features/volunteers/components/availability-detail-page';

export const Route = createFileRoute(
  '/_authenticated/_active-church/availability_/$checkId',
)({
  component: AvailabilityCheckPage,
});

function AvailabilityCheckPage() {
  const { checkId } = Route.useParams();
  const navigate = Route.useNavigate();
  return (
    <AvailabilityDetailPage
      key={checkId}
      checkId={checkId}
      onAnswered={() => navigate({ to: '/availability' })}
    />
  );
}
