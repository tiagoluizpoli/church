import { m } from '@church/i18n/messages';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { isAxiosError } from 'axios';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  formatTimeRange,
  formatWeekday,
  shiftCountOf,
  toGridValues,
  toIndexedHeadcounts,
  type UsualSetupBlock,
  type UsualSetupEntry,
  usualSetupShifts,
} from './usual-setup.utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { useSectorList } from '@/features/ministries/ministry-queries';
import { useMinistryRoles } from '@/features/ministries/role-queries';
import {
  useUsualSetup,
  usualSetupQueryKey,
} from '@/features/ministries/usual-setup-queries';
import {
  HeadcountGrid,
  type HeadcountGridCatalogItem,
  type HeadcountGridValues,
  headcountGridKey,
  normalizeHeadcountGrid,
} from '@/features/scheduling/components/headcount-grid/headcount-grid';
import type { SaveUsualSetupBlockBody } from '@/infrastructure/api/churchAPI.schemas';
import { useCallerCapabilitiesScope } from '@/shared/components/caller-capabilities-scope';
import { adminApi } from '@/utils/api-instances';

const WHOLE_BLOCK: UsualSetupEntry['shiftSplit'] = { kind: 'equal', count: 1 };

interface UsualSetupBlockEditorProps {
  ministryId: string;
  blockId: string;
}

/** The nested page for one Time block: loads what the form needs, then hands over. */
export function UsualSetupBlockEditor({
  ministryId,
  blockId,
}: UsualSetupBlockEditorProps) {
  const setup = useUsualSetup({ ministryId });
  const sectors = useSectorList({ ministryId });
  const roles = useMinistryRoles({ ministryId });
  const reads = [setup, sectors, roles];

  if (reads.some((read) => read.isPending)) {
    return (
      <div className="max-w-2xl space-y-3" aria-busy="true">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!setup.data || !sectors.data || !roles.data) {
    return (
      <div className="space-y-2" role="alert">
        <p className="text-muted-foreground">{m.usual_setup_load_failed()}</p>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            for (const read of reads) {
              if (read.isError) void read.refetch();
            }
          }}
        >
          {m.usual_setup_retry()}
        </Button>
      </div>
    );
  }

  const block = setup.data.blocks.find(
    (candidate) => candidate.sourceTemplateTimeBlockId === blockId,
  );
  if (!block) {
    return (
      <div className="space-y-2" role="status">
        <p className="text-muted-foreground">
          {m.usual_setup_block_not_found()}
        </p>
        <Link
          to="/ministries/$ministryId/usual-setup"
          params={{ ministryId }}
          className="text-sm underline underline-offset-2"
        >
          {m.usual_setup_back_to_list()}
        </Link>
      </div>
    );
  }

  return (
    // Keyed by block: a focus refetch refreshes choices, never the open draft.
    <UsualSetupBlockForm
      key={blockId}
      ministryId={ministryId}
      block={block}
      sectors={sectors.data.sectors}
      roles={roles.data.roles}
    />
  );
}

interface UsualSetupBlockFormProps {
  ministryId: string;
  block: UsualSetupBlock;
  sectors: HeadcountGridCatalogItem[];
  roles: HeadcountGridCatalogItem[];
}

interface SaveErrorMessageInput {
  error: unknown;
}

function saveErrorMessage({ error }: SaveErrorMessageInput): string {
  const message = isAxiosError(error)
    ? (error.response?.data as SaveErrorBody | undefined)?.message
    : undefined;
  return message ?? m.usual_setup_save_failed();
}

interface SaveErrorBody {
  message?: string;
}

function UsualSetupBlockForm({
  ministryId,
  block,
  sectors,
  roles,
}: UsualSetupBlockFormProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const churchId = useCallerCapabilitiesScope()?.churchId;
  const [serves, setServes] = useState(block.entry?.serves ?? false);
  // shortcut: the saved split is kept as is; ticket 14.2 adds split editing.
  const [shiftSplit] = useState(
    block.entry?.serves ? block.entry.shiftSplit : WHOLE_BLOCK,
  );
  const [values, setValues] = useState<HeadcountGridValues>(() =>
    toGridValues({ headcounts: block.entry?.headcounts ?? [] }),
  );
  const shifts = usualSetupShifts({ shiftSplit });
  const { entries, invalidKeys } = normalizeHeadcountGrid({
    sectors,
    roles,
    shifts,
    values,
  });
  const backToList = () =>
    navigate({
      to: '/ministries/$ministryId/usual-setup',
      params: { ministryId },
    });

  const save = useMutation({
    mutationFn: (body: SaveUsualSetupBlockBody) =>
      adminApi.saveUsualSetupBlock(
        ministryId,
        block.sourceTemplateTimeBlockId,
        body,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: usualSetupQueryKey({ churchId, ministryId }),
      });
      toast.success(m.usual_setup_saved_toast());
      await backToList();
    },
  });

  const hasCatalogs = sectors.length > 0 && roles.length > 0;
  const isEmpty = serves && entries.length === 0;
  const hasInvalid = serves && invalidKeys.length > 0;
  const canSave =
    !save.isPending && (!serves || (hasCatalogs && !isEmpty && !hasInvalid));

  const submit = () => {
    save.mutate(
      serves
        ? {
            serves,
            shiftSplit,
            headcounts: toIndexedHeadcounts({ entries }),
          }
        : { serves, shiftSplit: WHOLE_BLOCK, headcounts: [] },
    );
  };

  return (
    <form
      className="max-w-2xl space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSave) submit();
      }}
    >
      <div className="space-y-1">
        <h2 className="font-semibold text-lg">
          {block.templateName} · {block.label}
        </h2>
        <p className="text-muted-foreground text-sm">
          {formatWeekday(block)} · {formatTimeRange(block)}
        </p>
      </div>

      <div className="flex items-start gap-3">
        <Checkbox
          id="usual-setup-serves"
          className="mt-0.5"
          checked={serves}
          disabled={save.isPending}
          onCheckedChange={(checked) => setServes(checked)}
          aria-describedby="usual-setup-serves-help"
        />
        <div className="space-y-1">
          <label htmlFor="usual-setup-serves" className="font-medium text-sm">
            {m.usual_setup_serves_label()}
          </label>
          <p
            id="usual-setup-serves-help"
            className="text-muted-foreground text-xs"
          >
            {m.usual_setup_serves_help()}
          </p>
        </div>
      </div>

      {serves ? (
        <div className="space-y-3">
          <p className="text-muted-foreground text-sm">
            {shifts.length === 1
              ? m.usual_setup_split_whole_block()
              : m.usual_setup_split_kept({
                  count: shiftCountOf({ shiftSplit }),
                })}
          </p>
          <h3 className="font-medium text-sm">
            {m.usual_setup_people_needed()}
          </h3>
          <MissingCatalogs
            ministryId={ministryId}
            hasSectors={sectors.length > 0}
            hasRoles={roles.length > 0}
          />
          {hasCatalogs ? (
            <HeadcountGrid
              sectors={sectors}
              roles={roles}
              shifts={shifts}
              values={values}
              disabled={save.isPending}
              onChange={({ value, ...cell }) =>
                setValues((current) => ({
                  ...current,
                  [headcountGridKey(cell)]: value,
                }))
              }
            />
          ) : null}
          {hasCatalogs && hasInvalid ? (
            <p className="text-destructive text-sm">
              {m.usual_setup_fix_invalid()}
            </p>
          ) : null}
          {hasCatalogs && isEmpty ? (
            <p className="text-muted-foreground text-sm">
              {m.error_validation_usual_setup_empty()}
            </p>
          ) : null}
        </div>
      ) : null}

      {save.isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            {saveErrorMessage({ error: save.error })}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={!canSave}>
          {save.isPending ? m.usual_setup_saving() : m.usual_setup_save()}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={save.isPending}
          onClick={() => backToList()}
        >
          {m.usual_setup_cancel()}
        </Button>
      </div>
    </form>
  );
}

interface MissingCatalogsProps {
  ministryId: string;
  hasSectors: boolean;
  hasRoles: boolean;
}

/** Prerequisite shortcuts open in a new tab, so this draft stays put. */
function MissingCatalogs({
  ministryId,
  hasSectors,
  hasRoles,
}: MissingCatalogsProps) {
  const missing = [
    !hasSectors && {
      text: m.usual_setup_missing_sectors(),
      href: `/ministries/${ministryId}/sectors`,
      link: m.prepare_set_up_sectors(),
    },
    !hasRoles && {
      text: m.usual_setup_missing_roles(),
      href: `/ministries/${ministryId}/roles`,
      link: m.usual_setup_set_up_roles(),
    },
  ].filter((item) => item !== false);

  return missing.map((item) => (
    <p key={item.href} className="text-muted-foreground text-sm" role="status">
      {item.text}{' '}
      <a
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2"
      >
        {item.link}
        <span className="sr-only"> {m.sectors_opens_new_tab()}</span>
      </a>
    </p>
  ));
}
