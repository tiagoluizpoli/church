import { m } from '@church/i18n/messages';
import {
  type MutableRefObject,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { CycleBuilderData } from '../../hooks/use-cycle-builder';
import {
  coverageOf,
  groupProposalByDay,
  includedShifts,
  proposalAdditionKey,
  scheduleOrdinals,
} from '../../utils/builder/assignment-proposal.utils';
import { churchDayOf } from '../../utils/builder/cycle-builder-date.utils';
import { isStaffedEventTimeBlock } from '../../utils/shift-verdict';
import {
  type AttentionPerson,
  ProposalAttention,
} from './proposal/proposal-attention';
import {
  DayStrip,
  type DayStripDay,
  HowWeSuggest,
} from './proposal/proposal-header';
import { CoverageMeter } from './proposal/proposal-parts';
import { ProposalRail, type RailPerson } from './proposal/proposal-rail';
import {
  normaliseQuery,
  ProposalShiftTable,
} from './proposal/proposal-shift-table';
import {
  openPlacesOf,
  ProposalGapTable,
  type ProposalVolunteerGroup,
  ProposalVolunteerTable,
  type SetIncludedInput,
} from './proposal/proposal-side-views';
import { ResponsiveFormSurface } from '@/components/responsive-form-surface';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMediaQuery, XL_MEDIA_QUERY } from '@/hooks/use-media-query';
import type {
  GetAssignmentProposal200,
  GetAssignmentProposal200AdditionsItem,
} from '@/infrastructure/api/churchAPI.schemas';
import { useTimezone } from '@/shared/hooks/use-timezone';

export type AssignmentProposal = GetAssignmentProposal200;

// The underline sits inside the trigger: the list scrolls sideways on
// phones, and an overflow box would clip the default -5px offset.
const TAB_TRIGGER =
  'h-11 flex-none px-0 text-sm group-data-horizontal/tabs:after:bottom-0';
type Addition = GetAssignmentProposal200AdditionsItem;

/** `unknown`: the request failed without an answer, so it may have committed. */
export type ProposalApplyState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'unknown' }
  | { status: 'refused'; message: string };

/** The reviewed proposal and the picks left out of it. */
export interface ProposalSelection {
  proposal: AssignmentProposal;
  excluded: Addition[];
}

interface AssignmentProposalPreviewProps {
  data: CycleBuilderData;
  proposal: AssignmentProposal;
  applyState: ProposalApplyState;
  /** Keys of the picks left out (`proposalAdditionKey`): the review starts
   * from it and keeps it current, without re-rendering its owner. */
  exclusions: MutableRefObject<ReadonlySet<string>>;
  onApply: (selection: ProposalSelection) => void;
  onReviewNew: () => void;
  onDiscard: () => void;
}

interface ApplyActionProps {
  proposal: AssignmentProposal;
  excluded: Addition[];
  applyState: ProposalApplyState;
  onApply: (selection: ProposalSelection) => void;
  onReviewNew: () => void;
}

function ApplyAction({
  proposal,
  excluded,
  applyState,
  onApply,
  onReviewNew,
}: ApplyActionProps) {
  const selectedCount = proposal.additions.length - excluded.length;
  const { status } = applyState;
  if (proposal.additions.length === 0) return null;
  if (status === 'refused')
    return (
      <Button size="touch" className="max-md:flex-1" onClick={onReviewNew}>
        {m.builder_proposal_refresh()}
      </Button>
    );
  return (
    <Button
      size="touch"
      className="max-md:flex-1"
      disabled={status === 'pending' || selectedCount === 0}
      onClick={() => onApply({ proposal, excluded })}
    >
      {status === 'pending'
        ? m.builder_proposal_applying()
        : status === 'unknown'
          ? m.builder_proposal_apply_retry()
          : m.builder_proposal_apply_count({
              selected: selectedCount,
              total: proposal.additions.length,
            })}
    </Button>
  );
}

interface EmptyReasonInput {
  emptyReason: AssignmentProposal['emptyReason'];
}

function emptyReasonText({ emptyReason }: EmptyReasonInput): string | null {
  if (emptyReason === 'no_open_needs')
    return m.builder_proposal_empty_no_open_needs();
  if (emptyReason === 'no_confirmed_responses')
    return m.builder_proposal_empty_no_confirmed();
  if (emptyReason === 'no_eligible_placements')
    return m.builder_proposal_empty_no_eligible();
  return null;
}

interface VolunteerGroupsInput {
  additions: readonly Addition[];
}

/** Busiest first; equal loads by name, so the order never shuffles. */
function volunteerGroups({
  additions,
}: VolunteerGroupsInput): ProposalVolunteerGroup[] {
  const groups = new Map<string, ProposalVolunteerGroup>();
  for (const addition of additions) {
    const group = groups.get(addition.volunteerId) ?? {
      volunteerId: addition.volunteerId,
      name: addition.volunteerName,
      additions: [],
    };
    group.additions.push(addition);
    groups.set(addition.volunteerId, group);
  }
  return [...groups.values()].sort(
    (left, right) =>
      right.additions.length - left.additions.length ||
      left.name.localeCompare(right.name),
  );
}

interface RecapButtonProps {
  onClick: () => void;
  children: string;
}

/** A footer count that takes the leader to the list it counts. */
function RecapButton({ onClick, children }: RecapButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="radius-control inline-flex min-h-8 items-center text-foreground underline decoration-muted-foreground/60 underline-offset-4 outline-none hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </button>
  );
}

/**
 * Review of a proposal. Only Apply writes: exactly these additions, once
 * (ADR 0013). A refusal asks for a fresh review; an unanswered attempt is
 * retried with the same key so its committed outcome is recovered.
 */
export function AssignmentProposalPreview({
  data,
  proposal,
  applyState,
  exclusions,
  onApply,
  onReviewNew,
  onDiscard,
}: AssignmentProposalPreviewProps) {
  const { churchTimezone: timeZone } = useTimezone();
  // Same breakpoint as ResponsiveFormSurface's Dialog/Drawer swap.
  const isDesktop = useMediaQuery('(min-width: 768px)');
  // From here the day strip lives in the rail, beside the list.
  const isWide = useMediaQuery(XL_MEDIA_QUERY);
  const [excluded, setExcluded] = useState(() => exclusions.current);
  useEffect(() => {
    exclusions.current = excluded;
  }, [exclusions, excluded]);
  // Leaving with picks excluded would silently throw that work away.
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const requestDiscard = () =>
    excluded.size > 0 ? setConfirmingDiscard(true) : onDiscard();
  const [tab, setTab] = useState(
    proposal.additions.length > 0 ? 'shifts' : 'gaps',
  );
  const setIncluded = ({ additions, include }: SetIncludedInput) =>
    setExcluded((previous) => {
      const next = new Set(previous);
      for (const addition of additions) {
        const key = proposalAdditionKey(addition);
        if (include) next.delete(key);
        else next.add(key);
      }
      return next;
    });
  // Stable, so the memoised rows only re-render the one that changed.
  const toggle = useCallback(
    (addition: Addition) =>
      setExcluded((previous) => {
        const next = new Set(previous);
        const key = proposalAdditionKey(addition);
        if (!next.delete(key)) next.add(key);
        return next;
      }),
    [],
  );

  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [folded, setFolded] = useState<ReadonlySet<string>>(() => new Set());
  const toggleDay = useCallback(
    (day: string) =>
      setFolded((previous) => {
        const next = new Set(previous);
        if (!next.delete(day)) next.add(day);
        return next;
      }),
    [],
  );
  const bodyRef = useRef<HTMLDivElement>(null);
  const scrollBody = () =>
    bodyRef.current?.closest<HTMLElement>(
      '[data-testid="proposal-scroll-body"]',
    );
  // Each tab keeps its own place: back where the leader left it, the top
  // on a first visit. Only jumping to a day scrolls on purpose.
  const scrollByTab = useRef(new Map<string, number>());
  const rememberScroll = () =>
    scrollByTab.current.set(tab, scrollBody()?.scrollTop ?? 0);
  const changeTab = (next: string) => {
    rememberScroll();
    setTab(next);
    requestAnimationFrame(() =>
      scrollBody()?.scrollTo?.({ top: scrollByTab.current.get(next) ?? 0 }),
    );
  };
  // The rail fits the list's visible height, whatever the header takes.
  useEffect(() => {
    const body = bodyRef.current?.closest<HTMLElement>(
      '[data-testid="proposal-scroll-body"]',
    );
    if (!body || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() =>
      body.style.setProperty('--proposal-viewport', `${body.clientHeight}px`),
    );
    observer.observe(body);
    return () => observer.disconnect();
  }, []);
  const jumpToDay = (day: string) => {
    rememberScroll();
    setTab('shifts');
    setFolded((previous) => {
      const next = new Set(previous);
      next.delete(day);
      return next;
    });
    // After the tab and the unfolded day have rendered.
    requestAnimationFrame(() =>
      document
        .getElementById(`proposal-day-${day}`)
        ?.scrollIntoView?.({ block: 'start' }),
    );
  };

  const included = useMemo(
    () =>
      proposal.additions.filter(
        (addition) => !excluded.has(proposalAdditionKey(addition)),
      ),
    [proposal, excluded],
  );
  // The checkbox answers at once; coverage, loads and flags catch up a
  // frame later instead of holding the click.
  const settled = useDeferredValue(included);
  const days = useMemo(
    () => groupProposalByDay({ data, proposal, timeZone }),
    [data, proposal, timeZone],
  );
  const shifts = useMemo(() => includedShifts({ data }), [data]);
  const { ordinals, heavyLoad, severeLoad, totals } = useMemo(
    () => scheduleOrdinals({ data, additions: settled }),
    [data, settled],
  );
  const coverage = useMemo(
    () => coverageOf({ shifts, additions: settled }),
    [shifts, settled],
  );
  const coverageByDay = useMemo(
    () =>
      new Map(
        days.map(({ day, dayShifts }) => [
          day,
          coverageOf({ shifts: dayShifts, additions: settled }),
        ]),
      ),
    [days, settled],
  );
  const stripDays = useMemo((): DayStripDay[] => {
    const servedByDay = new Map<string, boolean>();
    for (const event of data.events)
      for (const block of event.eventTimeBlocks) {
        const day = churchDayOf({ value: block.startTime, timeZone });
        servedByDay.set(
          day,
          (servedByDay.get(day) ?? false) ||
            (isStaffedEventTimeBlock(block) && block.shifts.length > 0),
        );
      }
    return [...servedByDay].map(([day, served]) => ({
      day,
      coverage: coverageByDay.get(day),
      noShifts: !served,
    }));
  }, [data, timeZone, coverageByDay]);
  const groups = useMemo(() => volunteerGroups(proposal), [proposal]);
  // What needs a second look, from the proposal as a whole so a row stays
  // put while it is toggled: people past the heavy-load line (each with
  // the picks from the line on) and places only one person can fill.
  const attention = useMemo(() => {
    const load = scheduleOrdinals({ data, additions: proposal.additions });
    const people: AttentionPerson[] = groups
      .map(({ volunteerId, name, additions }) => ({
        volunteerId,
        name,
        total: load.totals.get(volunteerId) ?? 0,
        additions,
        flagged: additions
          .filter(
            (addition) =>
              (load.ordinals.get(proposalAdditionKey(addition)) ?? 0) >=
              load.heavyLoad,
          )
          .sort(
            (left, right) =>
              (load.ordinals.get(proposalAdditionKey(left)) ?? 0) -
              (load.ordinals.get(proposalAdditionKey(right)) ?? 0),
          ),
      }))
      .filter(({ flagged }) => flagged.length > 0)
      .sort((left, right) => right.total - left.total);
    const onlyOption = proposal.additions.filter(
      ({ reason }) => reason.needCandidateCount === 1,
    );
    return { load, people, onlyOption };
  }, [data, proposal, groups]);
  // From the whole proposal, so removing someone keeps their row in place.
  const railPeople: RailPerson[] = groups
    .map((group) => ({
      group,
      total: attention.load.totals.get(group.volunteerId) ?? 0,
    }))
    .filter(({ total }) => total >= attention.load.heavyLoad)
    .sort((left, right) => right.total - left.total);
  const openPlaceRows = useMemo(
    () => openPlacesOf({ days, excluded }),
    [days, excluded],
  );
  // People, not picks: who would carry a heavy load now, heaviest first.
  const loadedPeople = groups
    .map(({ volunteerId, name }) => ({
      name,
      total: totals.get(volunteerId) ?? 0,
    }))
    .filter(({ total }) => total >= heavyLoad)
    .sort((left, right) => right.total - left.total);
  const [heaviest] = loadedPeople;
  const onlyOptionCount = attention.onlyOption.filter(
    (addition) => !excluded.has(proposalAdditionKey(addition)),
  ).length;
  // The tab counts what it lists: people, plus single-option places.
  const attentionCount = attention.people.length + attention.onlyOption.length;
  const openPlaces =
    proposal.gaps.reduce((total, { remaining }) => total + remaining, 0) +
    excluded.size;
  const emptyText = emptyReasonText(proposal);
  const isApplying = applyState.status === 'pending';
  const locked = isApplying || applyState.status === 'unknown';
  const hasAdditions = proposal.additions.length > 0;
  const tableProps = {
    days,
    query: normaliseQuery(deferredQuery),
    coverageByDay,
    folded,
    onToggleDay: toggleDay,
    excluded,
    ordinals,
    totals,
    heavyLoad,
    severeLoad,
    locked,
    timeZone,
    onToggle: toggle,
  };

  const summary = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <p className="text-pretty text-foreground">
        {hasAdditions && (
          <strong className="font-semibold">
            {proposal.additions.length === 1
              ? m.builder_proposal_stat_additions_one()
              : m.builder_proposal_stat_additions_many({
                  count: proposal.additions.length,
                })}
          </strong>
        )}
        {hasAdditions && proposal.excludedUnconfirmedCount > 0 && (
          <span aria-hidden className="text-muted-foreground">
            {' · '}
          </span>
        )}
        {proposal.excludedUnconfirmedCount > 0 && (
          <span className="text-muted-foreground">
            {proposal.excludedUnconfirmedCount === 1
              ? m.builder_proposal_unconfirmed_one()
              : m.builder_proposal_unconfirmed_many({
                  count: proposal.excludedUnconfirmedCount,
                })}
          </span>
        )}
      </p>
      {hasAdditions && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {heaviest && (
            <span className="flex flex-wrap items-center gap-x-2">
              <span className="text-muted-foreground">
                {loadedPeople.length === 1
                  ? m.builder_proposal_summary_load_people_one()
                  : m.builder_proposal_summary_load_people_many({
                      count: loadedPeople.length,
                    })}
                {' · '}
              </span>
              <RecapButton onClick={() => changeTab('volunteers')}>
                {m.builder_proposal_summary_top_load({
                  name: heaviest.name,
                  count: heaviest.total,
                })}
              </RecapButton>
            </span>
          )}
          <HowWeSuggest
            heavyLoad={heavyLoad}
            severeLoad={severeLoad}
            showsOnlyOption={attention.onlyOption.length > 0}
            showsLoad={attention.people.length > 0}
          />
        </p>
      )}
    </div>
  );
  // Only the shift list is filtered, so the field shows only there.
  const filter = hasAdditions && tab === 'shifts' && (
    <Input
      type="search"
      value={query}
      onChange={(event) => setQuery(event.target.value)}
      aria-label={m.builder_proposal_filter_label()}
      placeholder={m.builder_proposal_filter_label()}
      className="mb-1.5 text-sm md:h-8 md:w-64"
    />
  );
  const strip = hasAdditions && stripDays.length > 1 && (
    <DayStrip days={stripDays} wrap={isWide} onJump={jumpToDay} />
  );

  return (
    <Tabs value={tab} onValueChange={changeTab} className="contents">
      <ResponsiveFormSurface
        open
        wide
        closeDisabled={isApplying}
        onOpenChange={(open) => !(open || isApplying) && requestDiscard()}
        title={m.builder_proposal_title()}
        description={m.builder_proposal_description()}
        reviewBodyLabel={m.builder_proposal_list_label()}
        reviewSummary={
          <div className="mt-2 space-y-2">
            <div className="grid gap-x-8 gap-y-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
              {isDesktop && summary}
              {coverage.required > 0 && (
                <div className="flex items-center gap-3">
                  {/* The reopened note shares the label's line, so nothing moves. */}
                  <p className="whitespace-nowrap text-muted-foreground text-sm max-md:sr-only">
                    {m.builder_proposal_coverage_short()}
                    {excluded.size > 0 &&
                      ` · ${
                        excluded.size === 1
                          ? m.builder_proposal_coverage_reopened_one()
                          : m.builder_proposal_coverage_reopened_many({
                              count: excluded.size,
                            })
                      }`}
                  </p>
                  <CoverageMeter
                    className="flex-1 md:w-56"
                    coverage={coverage}
                  />
                </div>
              )}
            </div>
            {isDesktop && !isWide && strip}
            {days.length > 0 && (
              <div className="flex flex-wrap items-end justify-between gap-x-6">
                <TabsList
                  variant="line"
                  className="h-auto max-w-full justify-start gap-4 overflow-x-auto p-0 max-md:gap-3"
                >
                  <TabsTrigger className={TAB_TRIGGER} value="shifts">
                    <span className="md:hidden">
                      {m.builder_proposal_tab_shifts_short()}
                    </span>
                    <span className="max-md:hidden">
                      {m.builder_proposal_tab_shifts()}
                    </span>
                  </TabsTrigger>
                  {hasAdditions && (
                    <TabsTrigger className={TAB_TRIGGER} value="attention">
                      {m.builder_proposal_tab_attention({
                        count: attentionCount,
                      })}
                    </TabsTrigger>
                  )}
                  {hasAdditions && (
                    <TabsTrigger className={TAB_TRIGGER} value="volunteers">
                      <span className="md:hidden">
                        {m.builder_proposal_tab_volunteers_short()}
                      </span>
                      <span className="max-md:hidden">
                        {m.builder_proposal_tab_volunteers()}
                      </span>
                    </TabsTrigger>
                  )}
                  <TabsTrigger className={TAB_TRIGGER} value="gaps">
                    <span className="md:hidden">
                      {m.builder_proposal_tab_gaps_short({ count: openPlaces })}
                    </span>
                    <span className="max-md:hidden">
                      {m.builder_proposal_tab_gaps({ count: openPlaces })}
                    </span>
                  </TabsTrigger>
                </TabsList>
                {isDesktop && filter}
              </div>
            )}
          </div>
        }
        footer={
          <>
            {applyState.status === 'refused' ? (
              <p
                role="alert"
                className="text-destructive text-sm max-md:w-full sm:mr-auto sm:self-center"
              >
                {applyState.message}
              </p>
            ) : applyState.status === 'unknown' ? (
              <p
                role="alert"
                className="text-amber-700 text-sm max-md:w-full sm:mr-auto sm:self-center dark:text-amber-300"
              >
                {m.builder_proposal_apply_unknown()}
              </p>
            ) : (
              hasAdditions && (
                <p className="mr-auto flex flex-wrap items-center gap-x-2 self-center text-sm max-md:hidden">
                  {[
                    onlyOptionCount > 0 && (
                      <RecapButton
                        key="only"
                        onClick={() => changeTab('attention')}
                      >
                        {onlyOptionCount === 1
                          ? m.builder_proposal_recap_only_one()
                          : m.builder_proposal_recap_only_many({
                              count: onlyOptionCount,
                            })}
                      </RecapButton>
                    ),
                    openPlaces > 0 && (
                      <RecapButton key="open" onClick={() => changeTab('gaps')}>
                        {openPlaces === 1
                          ? m.builder_proposal_gap_one()
                          : m.builder_proposal_gap_many({ count: openPlaces })}
                      </RecapButton>
                    ),
                  ]
                    .filter(Boolean)
                    .flatMap((item, index) =>
                      index === 0
                        ? [item]
                        : [
                            <span
                              key={`dot-${index}`}
                              aria-hidden
                              className="text-muted-foreground"
                            >
                              ·
                            </span>,
                            item,
                          ],
                    )}
                </p>
              )
            )}
            <Button
              variant="outline"
              size="touch"
              className="max-md:flex-none"
              disabled={isApplying}
              onClick={requestDiscard}
            >
              {hasAdditions ? m.builder_proposal_discard() : m.shell_close()}
            </Button>
            <ApplyAction
              proposal={proposal}
              applyState={applyState}
              onApply={onApply}
              onReviewNew={onReviewNew}
              excluded={proposal.additions.filter((addition) =>
                excluded.has(proposalAdditionKey(addition)),
              )}
            />
          </>
        }
      >
        <div
          ref={bodyRef}
          data-testid="assignment-proposal-preview"
          className="text-sm"
        >
          {/* On phones the summary scrolls away with the list, so rows show. */}
          {!isDesktop && (
            <div className="space-y-3 border-b py-3">
              {summary}
              {strip}
              {filter}
            </div>
          )}
          {emptyText && <p className="py-4 font-semibold">{emptyText}</p>}
          {days.length > 0 && (
            <>
              <TabsContent
                keepMounted
                value="shifts"
                tabIndex={-1}
                className="text-sm"
              >
                <div className="xl:grid xl:grid-cols-[minmax(0,60rem)_minmax(20rem,1fr)] xl:items-start xl:gap-10">
                  <ProposalShiftTable {...tableProps} />
                  <aside className="sticky top-0 max-xl:hidden xl:max-h-[calc(var(--proposal-viewport,60vh)-3rem)] xl:overflow-y-auto">
                    <ProposalRail
                      days={isWide && strip}
                      people={railPeople}
                      openPlaces={openPlaceRows}
                      excluded={excluded}
                      severeLoad={severeLoad}
                      locked={locked}
                      timeZone={timeZone}
                      onSetIncluded={setIncluded}
                      onJumpToDay={jumpToDay}
                      onShowVolunteers={() => changeTab('volunteers')}
                      onShowGaps={() => changeTab('gaps')}
                    />
                  </aside>
                </div>
              </TabsContent>
              <TabsContent
                keepMounted
                value="attention"
                tabIndex={-1}
                className="text-sm"
              >
                {attentionCount === 0 ? (
                  <div className="flex flex-wrap items-center gap-3 py-6">
                    <p className="text-muted-foreground">
                      {m.builder_proposal_attention_empty()}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => changeTab('shifts')}
                    >
                      {m.builder_proposal_attention_show_all()}
                    </Button>
                  </div>
                ) : (
                  <ProposalAttention
                    days={days}
                    people={attention.people}
                    onlyOption={attention.onlyOption}
                    excluded={excluded}
                    ordinals={attention.load.ordinals}
                    heavyLoad={attention.load.heavyLoad}
                    severeLoad={attention.load.severeLoad}
                    locked={locked}
                    timeZone={timeZone}
                    onToggle={toggle}
                    onSetIncluded={setIncluded}
                  />
                )}
              </TabsContent>
              <TabsContent
                keepMounted
                value="volunteers"
                tabIndex={-1}
                className="text-sm"
              >
                <ProposalVolunteerTable
                  groups={groups}
                  totals={totals}
                  heavyLoad={heavyLoad}
                  severeLoad={severeLoad}
                  days={days}
                  excluded={excluded}
                  locked={locked}
                  timeZone={timeZone}
                  onSetIncluded={setIncluded}
                />
              </TabsContent>
              <TabsContent
                keepMounted
                value="gaps"
                tabIndex={-1}
                className="pt-3 text-sm"
              >
                <ProposalGapTable
                  days={days}
                  excluded={excluded}
                  timeZone={timeZone}
                  onJumpToDay={jumpToDay}
                  onShowShifts={() => changeTab('shifts')}
                />
              </TabsContent>
            </>
          )}
        </div>
      </ResponsiveFormSurface>
      <AlertDialog open={confirmingDiscard} onOpenChange={setConfirmingDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {m.builder_proposal_discard_confirm_title()}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              {excluded.size === 1
                ? m.builder_proposal_discard_confirm_body_one()
                : m.builder_proposal_discard_confirm_body_many({
                    count: excluded.size,
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {m.builder_proposal_discard_confirm_keep()}
            </AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onDiscard}>
              {m.builder_proposal_discard()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Tabs>
  );
}

interface ProposalLoadingProps {
  onCancel: () => void;
}

/** The review's own frame while the proposal is computed, so the leader
 * sees where it will appear instead of only a busy button. */
export function ProposalLoading({ onCancel }: ProposalLoadingProps) {
  return (
    <ResponsiveFormSurface
      open
      wide
      onOpenChange={(open) => !open && onCancel()}
      title={m.builder_proposal_title()}
      description={m.builder_proposal_description()}
      reviewSummary={
        <div className="mt-3 space-y-3" aria-hidden>
          <Skeleton className="radius-control h-5 w-64" />
          <Skeleton className="radius-control h-8 w-full max-w-3xl" />
          <Skeleton className="radius-control mb-3 h-6 w-80" />
        </div>
      }
      footer={
        <Button variant="outline" size="touch" onClick={onCancel}>
          {m.shell_close()}
        </Button>
      }
    >
      <div role="status" aria-busy className="space-y-2 py-3">
        <span className="sr-only">{m.builder_proposal_loading()}</span>
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="radius-control h-9 w-full" />
        ))}
      </div>
    </ResponsiveFormSurface>
  );
}
