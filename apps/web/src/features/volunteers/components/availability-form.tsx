import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@base-fullstack-template/ui/components/card';
import { Input } from '@base-fullstack-template/ui/components/input';
import { Label } from '@base-fullstack-template/ui/components/label';
import { Clock, Info } from 'lucide-react';
import { useTimezone } from '../../../shared/hooks/use-timezone';

/**
 * Form for volunteers to set their availability.
 * Features a prominent timezone indicator to ensure DST-safe entries.
 */
export function AvailabilityForm() {
  const { effectiveTimezone, isChurchTime } = useTimezone();

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Set Availability</CardTitle>
        <CardDescription>
          Specify when you are unavailable to serve.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Timezone Indicator Indicator (T017) */}
        <div className="flex flex-col gap-2 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
          <div className="flex items-center gap-2 font-medium text-blue-700 dark:text-blue-300">
            <Clock className="h-4 w-4" />
            <span>Timezone Context</span>
          </div>
          <p className="text-blue-600 text-sm dark:text-blue-400">
            You are currently viewing and setting times in{' '}
            <span className="font-bold underline">{effectiveTimezone}</span> (
            {isChurchTime ? 'Church Time' : 'Your Local Time'}).
          </p>
          <div className="mt-2 flex items-start gap-2 text-blue-500 text-xs dark:text-blue-500">
            <Info className="mt-0.5 h-3 w-3 flex-shrink-0" />
            <span>
              All times are automatically converted and stored in UTC to ensure
              accuracy regardless of Daylight Saving Time transitions.
            </span>
          </div>
        </div>

        {/* Basic Form Inputs */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="start-time">Start Date & Time</Label>
            <Input id="start-time" type="datetime-local" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="end-time">End Date & Time</Label>
            <Input id="end-time" type="datetime-local" />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="reason">Reason (Optional)</Label>
          <Input id="reason" placeholder="e.g., Family vacation" />
        </div>
      </CardContent>
    </Card>
  );
}
