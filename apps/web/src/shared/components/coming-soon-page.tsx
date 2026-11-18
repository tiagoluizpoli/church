import { m } from '@church/i18n/messages';

interface ComingSoonPageProps {
  title: string;
}

/** Stands in for a page whose owning spec is not built yet; that spec replaces the route body. */
export function ComingSoonPage({ title }: ComingSoonPageProps) {
  return (
    <div className="space-y-2">
      <h1 className="font-semibold text-2xl tracking-tight">{title}</h1>
      <p className="text-muted-foreground">{m.shell_coming_soon()}</p>
    </div>
  );
}
