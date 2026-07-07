import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@church/ui/components/card';
import { CreateCycleForm } from './create-cycle-form';

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
