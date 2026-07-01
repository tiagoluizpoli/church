import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/todos')({
  component: TodosRoute,
});

function TodosRoute() {
  return (
    <div className="mx-auto w-full max-w-md py-10 text-center text-muted-foreground">
      Todos removed.
    </div>
  );
}
