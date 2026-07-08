import { CreateCycleForm } from './create-cycle-form';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export function CreateCycleCard() {
  return (
    <Card className="surface-panel">
      <CardHeader>
        <CardTitle>Create cycle</CardTitle>
        <CardDescription>
          Cycles are church-wide and cannot overlap.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <CreateCycleForm submitButtonClassName="w-full justify-center sm:w-auto" />
      </CardContent>
    </Card>
  );
}
