// PROTOTYPE (wayfinder #1093). Shared pieces: phone shell, QR placeholder, fake data.
import { useNavigate, useSearch } from '@tanstack/react-router';
import { ArrowLeft, Bell, Menu } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export const CHILDREN = {
  ana: {
    name: 'Ana Souza',
    first: 'Ana',
    age: '3 anos',
    spot: 'ponto Kids 0-4 · sala Berçário',
  },
  joao: {
    name: 'João Souza',
    first: 'João',
    age: '7 anos',
    spot: 'ponto Kids 5-13 · sala Exploradores',
  },
};

export function useGo() {
  const navigate = useNavigate();
  const { v } = useSearch({ from: '/prototype/kids' });
  return (tela: string) =>
    navigate({ to: '/prototype/kids', search: { tela, v } });
}

/** The app's mobile header + scroll area + an optional pinned action bar. */
export function Phone({
  title,
  back,
  footer,
  children,
  bare,
  plain,
}: {
  title?: string;
  back?: string;
  footer?: ReactNode;
  children: ReactNode;
  bare?: boolean;
  /** Signing up: no bell or menu yet. */
  plain?: boolean;
}) {
  const go = useGo();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {bare ? null : (
        <header className="flex h-16 shrink-0 items-center gap-2 border-sidebar-border border-b bg-sidebar px-4">
          {back ? (
            <Button
              variant="ghost"
              size="icon-touch"
              aria-label="Voltar"
              onClick={() => go(back)}
            >
              <ArrowLeft />
            </Button>
          ) : (
            <span className="radius-icon grid size-9 place-items-center bg-primary/12 font-bold text-primary">
              IS
            </span>
          )}
          <h1 className="min-w-0 flex-1 truncate font-bold text-sm">
            {back ? title : 'Igreja Semente'}
          </h1>
          {plain ? null : (
            <>
              <Button
                variant="outline"
                size="icon-touch"
                aria-label="Notificações"
                onClick={() => go('avisos')}
              >
                <Bell />
              </Button>
              <Button
                variant="outline"
                size="icon-touch"
                aria-label="Abrir menu"
                onClick={() => go('menu')}
              >
                <Menu />
              </Button>
            </>
          )}
        </header>
      )}
      <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 text-sm leading-relaxed *:shrink-0">
        {children}
      </main>
      {footer ? (
        <footer className="flex shrink-0 flex-col gap-2 border-t bg-sidebar p-4">
          {footer}
        </footer>
      ) : null}
    </div>
  );
}

export function Heading({
  children,
  sub,
}: {
  children: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <h1 className="text-balance font-bold text-xl leading-tight">
        {children}
      </h1>
      {sub ? <p className="text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

export function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('surface-panel space-y-3 p-4', className)}>
      {children}
    </section>
  );
}

export function Notice({
  children,
  tone = 'info',
}: {
  children: ReactNode;
  tone?: 'info' | 'warn';
}) {
  return (
    <div
      className={cn(
        'radius-surface space-y-2 border p-3',
        tone === 'warn'
          ? 'border-amber-600/40 bg-amber-500/8'
          : 'border-primary/20 bg-primary/8',
      )}
    >
      {children}
    </div>
  );
}

export function Field({
  label,
  hint,
  ...props
}: { label: string; hint?: string } & React.ComponentProps<'input'>) {
  const id = label.replace(/\W/g, '');
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block font-bold">
        {label}
      </label>
      <Input id={id} {...props} />
      {hint ? <p className="text-muted-foreground text-sm">{hint}</p> : null}
    </div>
  );
}

export function Check({
  children,
  hint,
  ...props
}: { children: ReactNode; hint?: ReactNode } & React.ComponentProps<
  typeof Checkbox
>) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the Checkbox is the control
    <label className="flex min-h-11 items-start gap-3">
      <Checkbox
        className="mt-1 size-5 data-disabled:border-border data-disabled:bg-muted"
        {...props}
      />
      <span>
        <span className="block">{children}</span>
        {hint ? (
          <span className="block text-muted-foreground text-sm">{hint}</span>
        ) : null}
      </span>
    </label>
  );
}

export function Initials({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'radius-control grid size-10 shrink-0 place-items-center bg-primary/12 font-bold text-primary',
        className,
      )}
    >
      {name
        .split(' ')
        .map((p) => p[0])
        .slice(0, 2)
        .join('')}
    </span>
  );
}

export function Row({
  title,
  detail,
  lead,
  action,
}: {
  title: ReactNode;
  detail?: ReactNode;
  lead?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-11 items-center gap-3">
      {lead}
      <div className="min-w-0 flex-1">
        <p className="font-bold">{title}</p>
        {detail ? (
          <p className="text-muted-foreground text-sm">{detail}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/** A drawing that looks like a QR. It encodes nothing. */
export function Qr({
  seed = 23,
  className,
}: {
  seed?: number;
  className?: string;
}) {
  const size = 25;
  const finder = (x: number, y: number) =>
    [
      [0, 0],
      [size - 7, 0],
      [0, size - 7],
    ].some(
      ([fx, fy]) => x >= fx - 1 && x < fx + 8 && y >= fy - 1 && y < fy + 8,
    );
  let d = '';
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if (!finder(x, y) && (x * 7 + y * 13 + x * y * seed) % 5 < 2)
        d += `M${x} ${y}h1v1h-1z`;
  for (const [x, y] of [
    [0, 0],
    [size - 7, 0],
    [0, size - 7],
  ])
    d += `M${x} ${y}h7v7h-7zM${x + 1} ${y + 1}v5h5v-5zM${x + 2} ${y + 2}h3v3h-3z`;
  return (
    <div className={cn('radius-surface bg-white p-4', className)}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="w-full fill-black"
        role="img"
        aria-label="QR de exemplo"
      >
        <path d={d} fillRule="evenodd" />
      </svg>
    </div>
  );
}
