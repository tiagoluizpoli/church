import { Link, useNavigate } from '@tanstack/react-router';
import { TimezoneToggle } from '../shared/components/timezone-toggle';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useMediaQuery } from '@/hooks/use-media-query';
import { authClient } from '@/lib/auth-client';

interface GetInitialsInput {
  name: string;
}

function getInitials({ name }: GetInitialsInput): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = [parts[0], parts[parts.length - 1]]
    .filter(Boolean)
    .map((part) => part?.[0])
    .join('');
  return initials.toUpperCase() || '?';
}

export default function UserMenu() {
  const navigate = useNavigate();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return <Skeleton className="h-9 w-24" />;
  }

  if (!session) {
    return (
      <Link to="/login">
        <Button variant="outline">Sign In</Button>
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={`Account menu for ${session.user.name}`}
            className="radius-icon flex h-9 w-9 shrink-0 items-center justify-center transition-opacity hover:opacity-80"
          />
        }
      >
        <Avatar className="size-9 rounded-md after:rounded-md">
          <AvatarFallback className="rounded-md bg-primary/12 font-medium text-primary">
            {getInitials({ name: session.user.name })}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 bg-card">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
            <span className="font-semibold text-foreground text-sm">
              {session.user.name}
            </span>
            <span className="font-normal text-muted-foreground text-xs">
              {session.user.email}
            </span>
          </DropdownMenuLabel>
          {isDesktop ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                closeOnClick={false}
                className="flex items-center justify-between gap-3"
              >
                <span>Church time</span>
                <TimezoneToggle variant="ghost" size="xs" />
              </DropdownMenuItem>
            </>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              authClient.signOut({
                fetchOptions: {
                  onSuccess: () => {
                    navigate({
                      to: '/',
                    });
                  },
                },
              });
            }}
          >
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
