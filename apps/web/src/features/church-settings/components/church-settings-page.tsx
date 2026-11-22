import {
  type ChurchSlugRefusal,
  churchSlugRefusal,
  slugFromName,
} from '@church/app-config/church-slug';
import { m } from '@church/i18n/messages';
import { Link } from '@tanstack/react-router';
import {
  AlertCircle,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Church as ChurchIcon,
  Eye,
  Globe,
  Link2,
  Wand2,
} from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { HeaderStatChip } from '@/components/header-stat-chip';
import { IconInputField } from '@/components/icon-input-field';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { FormControlSizeProvider } from '@/components/ui/form-control-size';
import { Pending } from '@/components/ui/pending';
import { Skeleton } from '@/components/ui/skeleton';
import {
  WorkspaceIntroPanel,
  WorkspacePage,
} from '@/components/workspace-page';
import {
  type ChurchSettingsForm,
  toChurchSettingsForm,
  toSaveBody,
} from '@/features/church-settings/church-settings-form';
import {
  checkChurchSlug,
  fieldErrorsOf,
  useChurchSettings,
  useSaveChurchSettings,
} from '@/features/church-settings/church-settings-queries';
import { AccentPicker } from '@/features/church-settings/components/accent-picker';
import { AddressSection } from '@/features/church-settings/components/address-section';
import { ChurchPreview } from '@/features/church-settings/components/church-preview';
import { LogoCard } from '@/features/church-settings/components/logo-card';
import { useMediaQuery } from '@/hooks/use-media-query';
import type { GetChurchSettings200 } from '@/infrastructure/api/churchAPI.schemas';
import { cn } from '@/lib/utils';

const SECTIONS = ['info', 'address'] as const;
type SectionKey = (typeof SECTIONS)[number];
type SectionOpenState = Record<SectionKey, boolean>;
type FieldErrors = Record<string, string>;

const INFO_FIELDS = ['name', 'slug', 'website', 'accentColor'];

const SLUG_REFUSAL_MESSAGES: Record<ChurchSlugRefusal, () => string> = {
  LENGTH: m.error_church_settings_slug_length,
  FORMAT: m.error_church_settings_slug_format,
  RESERVED: m.error_church_settings_slug_reserved,
};

interface SlugErrorInput {
  slug: string;
}

/** The immediate, client-side refusal of a typed slug, or undefined while it is acceptable. */
function slugError({ slug }: SlugErrorInput): string | undefined {
  const refusal = churchSlugRefusal(slug.trim());
  return refusal ? SLUG_REFUSAL_MESSAGES[refusal]() : undefined;
}

interface CountInput {
  count: number;
}

function sectionErrorsLabel({ count }: CountInput): string {
  return count === 1
    ? m.church_settings_section_errors_one()
    : m.church_settings_section_errors_many({ count });
}

interface AllSectionsInput {
  open: boolean;
}

function allSections({ open }: AllSectionsInput): SectionOpenState {
  return { info: open, address: open };
}

interface SectionCardProps {
  id: SectionKey;
  title: string;
  summary: string;
  errors: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

/** A collapsible settings section; its collapsed header keeps a summary, and the error count always shows. */
function SectionCard({
  id,
  title,
  summary,
  errors,
  open,
  onToggle,
  children,
}: SectionCardProps) {
  const bodyId = `church-settings-${id}-body`;
  return (
    <section className="surface-panel">
      <h2>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-[inherit] p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="min-w-0">
            <span className="block font-semibold text-base">{title}</span>
            {open ? null : (
              <span className="block truncate font-normal text-muted-foreground text-sm">
                {summary}
              </span>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {errors ? (
              <Badge variant="destructive">
                {sectionErrorsLabel({ count: errors })}
              </Badge>
            ) : null}
            <ChevronDown
              className={cn('size-4 transition', open && 'rotate-180')}
              aria-hidden
            />
          </span>
        </button>
      </h2>
      {open ? (
        <div id={bodyId} className="space-y-4 border-t p-4">
          {children}
        </div>
      ) : null}
    </section>
  );
}

interface SaveBarProps {
  errorCount: number;
  isSaving: boolean;
  onDiscard: () => void;
  onSave: () => void;
}

function SaveBar({ errorCount, isSaving, onDiscard, onSave }: SaveBarProps) {
  return (
    <section
      aria-label={m.church_settings_unsaved()}
      className="fixed inset-x-3 bottom-4 z-40 mx-auto flex max-w-xl flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border bg-background p-2 pl-4 shadow-lg sm:inset-x-0 sm:w-fit"
    >
      <span className="text-sm">
        {errorCount ? (
          <span className="font-medium text-destructive">
            {errorCount === 1
              ? m.church_settings_error_count_one()
              : m.church_settings_error_count_many({ count: errorCount })}
          </span>
        ) : (
          m.church_settings_unsaved()
        )}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="ghost" disabled={isSaving} onClick={onDiscard}>
          {m.church_settings_discard()}
        </Button>
        <Button disabled={isSaving} onClick={onSave}>
          {m.church_settings_save()}
        </Button>
      </div>
    </section>
  );
}

interface ChurchSettingsEditorProps {
  saved: GetChurchSettings200;
}

function ChurchSettingsEditor({ saved }: ChurchSettingsEditorProps) {
  // Keyed on the form fields only: a logo change (applied at once) must not reset unsaved edits.
  const { name, slug, website, accentColor, addresses } = saved;
  const savedForm = React.useMemo(
    () =>
      toChurchSettingsForm({
        settings: { name, slug, website, accentColor, addresses },
      }),
    [name, slug, website, accentColor, addresses],
  );
  const [form, setForm] = React.useState<ChurchSettingsForm>(savedForm);
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [open, setOpen] = React.useState<SectionOpenState>(() =>
    allSections({ open: true }),
  );
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [confirmingSlug, setConfirmingSlug] = React.useState(false);
  const isMobile = useMediaQuery('(max-width: 767px)');
  const saveSettings = useSaveChurchSettings();

  // A successful save hands back the server's normalised settings; show them.
  React.useEffect(() => setForm(savedForm), [savedForm]);

  const dirty = JSON.stringify(form) !== JSON.stringify(savedForm);
  const errorCount = Object.keys(errors).length;
  const infoErrors = INFO_FIELDS.filter((field) => errors[field]).length;
  const slugChanged = form.slug.trim() !== saved.slug;
  const typedSlugError = slugChanged
    ? slugError({ slug: form.slug })
    : undefined;
  const shownSlugError = errors.slug ?? typedSlugError;
  const churchAddress = `${saved.publicOrigin}/${form.slug.trim()}`;
  const addressErrors = Object.keys(errors).filter((field) =>
    field.startsWith('addresses'),
  ).length;
  const privateCount = form.addresses.filter(
    (address) => !address.isPublic,
  ).length;
  const publicCount =
    [form.name, form.website, form.accentColor, saved.logoUrl].filter(Boolean)
      .length +
    form.addresses.length -
    privateCount;
  const mainAddress = form.addresses.find((address) => address.isMain);
  const addressSummary =
    form.addresses.length === 0
      ? m.church_settings_address_summary_none()
      : form.addresses.length === 1
        ? m.church_settings_address_summary_one({
            place: `${mainAddress?.city}/${mainAddress?.uf}`,
          })
        : m.church_settings_address_summary_many({
            count: form.addresses.length,
            place: `${mainAddress?.city}/${mainAddress?.uf}`,
          });

  const patch = (changes: Partial<ChurchSettingsForm>) => {
    setForm((current) => ({ ...current, ...changes }));
    setErrors((current) =>
      Object.fromEntries(
        Object.entries(current).filter(
          ([field]) =>
            !Object.keys(changes).some(
              (key) => field === key || field.startsWith(`${key}.`),
            ),
        ),
      ),
    );
  };

  const checkSlug = () => {
    if (!slugChanged || typedSlugError) return;
    const typed = form.slug.trim();
    checkChurchSlug({ slug: typed }).then(({ status }) => {
      if (status === 'taken') {
        setErrors((current) => ({
          ...current,
          slug: m.error_church_settings_slug_taken(),
        }));
      }
    });
  };

  const save = () => {
    if (typedSlugError) return;
    if (slugChanged && !confirmingSlug) {
      setConfirmingSlug(true);
      return;
    }
    setConfirmingSlug(false);
    saveSettings.mutate(toSaveBody({ form, slugChanged }), {
      onSuccess: () => {
        setErrors({});
        toast.success(m.church_settings_saved());
      },
      onError: (error) => {
        const refused = fieldErrorsOf({ error });
        if (!refused) {
          toast.error(m.church_settings_save_failed());
          return;
        }
        setErrors(refused);
        setOpen((current) => ({
          ...current,
          info: current.info || INFO_FIELDS.some((field) => field in refused),
          address:
            current.address ||
            Object.keys(refused).some((field) => field.startsWith('addresses')),
        }));
      },
    });
  };

  const saveRef = React.useRef(save);
  saveRef.current = save;
  const canSave = dirty && !saveSettings.isPending;
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (canSave) saveRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canSave]);

  const allOpen = SECTIONS.every((key) => open[key]);
  const toggle = (key: SectionKey) =>
    setOpen((current) => ({ ...current, [key]: !current[key] }));

  return (
    <FormControlSizeProvider size={isMobile ? 'touch' : 'default'}>
      <WorkspacePage className="space-y-4 pb-28">
        <WorkspaceIntroPanel
          title={m.church_settings_title()}
          description={m.church_settings_description()}
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <HeaderStatChip
                testId="church-settings-public-count"
                testIdOnValue
                label={m.church_settings_public_chip()}
                value={publicCount}
              />
              <HeaderStatChip
                testId="church-settings-admin-only-count"
                testIdOnValue
                label={m.church_settings_admin_only_chip()}
                value={privateCount}
              />
              <Button
                variant="outline"
                className="xl:hidden"
                onClick={() => setPreviewOpen(true)}
              >
                <Eye aria-hidden /> {m.church_settings_show_preview()}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setOpen(allSections({ open: !allOpen }))}
              >
                {allOpen ? (
                  <ChevronsDownUp aria-hidden />
                ) : (
                  <ChevronsUpDown aria-hidden />
                )}
                {allOpen
                  ? m.church_settings_collapse_all()
                  : m.church_settings_expand_all()}
              </Button>
            </div>
          }
        />
        {errorCount ? (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-destructive text-sm"
          >
            <AlertCircle className="size-4 shrink-0" aria-hidden />
            {errorCount === 1
              ? m.church_settings_failed_one()
              : m.church_settings_failed_many({ count: errorCount })}
          </div>
        ) : null}
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-3">
            <SectionCard
              id="info"
              title={m.church_settings_section_info()}
              summary={`${form.name} · ${churchAddress}`}
              errors={infoErrors}
              open={open.info}
              onToggle={() => toggle('info')}
            >
              <div className="grid gap-6 md:grid-cols-[13rem_minmax(0,1fr)]">
                <LogoCard logoUrl={saved.logoUrl} logoKey={saved.logoKey} />
                <div className="min-w-0 space-y-4">
                  <div className="grid gap-4 2xl:grid-cols-2">
                    <IconInputField
                      icon={ChurchIcon}
                      label={m.church_settings_name_label()}
                      value={form.name}
                      error={errors.name}
                      autoComplete="organization"
                      onChange={(event) => patch({ name: event.target.value })}
                    />
                    <IconInputField
                      icon={Globe}
                      label={m.church_settings_website_label()}
                      hint={m.church_settings_website_hint()}
                      placeholder="https://"
                      inputMode="url"
                      value={form.website}
                      error={errors.website}
                      onChange={(event) =>
                        patch({ website: event.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <IconInputField
                      icon={Link2}
                      label={m.church_settings_slug_label()}
                      hint={m.church_settings_slug_hint()}
                      value={form.slug}
                      error={shownSlugError}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      onChange={(event) => patch({ slug: event.target.value })}
                      onBlur={checkSlug}
                    />
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-muted-foreground text-sm">
                        {churchAddress}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => patch({ slug: slugFromName(form.name) })}
                      >
                        <Wand2 aria-hidden />{' '}
                        {m.church_settings_slug_generate()}
                      </Button>
                    </div>
                  </div>
                  <AccentPicker
                    value={form.accentColor}
                    error={errors.accentColor}
                    touch={isMobile}
                    onChange={(accentColor) => patch({ accentColor })}
                  />
                </div>
              </div>
            </SectionCard>
            <SectionCard
              id="address"
              title={m.church_settings_section_address()}
              summary={addressSummary}
              errors={addressErrors}
              open={open.address}
              onToggle={() => toggle('address')}
            >
              <AddressSection
                addresses={form.addresses}
                errors={errors}
                onChange={(addresses) => patch({ addresses })}
              />
            </SectionCard>
            <p className="text-muted-foreground text-sm">
              {m.church_settings_programme_prefix()}{' '}
              <Link
                to="/app/event-templates"
                className="rounded-sm text-foreground underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {m.nav_event_templates()}
              </Link>
            </p>
          </div>
          <aside
            className="hidden min-w-0 xl:sticky xl:top-4 xl:block xl:self-start"
            aria-labelledby="church-settings-preview-title"
          >
            <ChurchPreview
              form={form}
              logoUrl={saved.logoUrl}
              titleId="church-settings-preview-title"
            />
          </aside>
        </div>
        <Drawer
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          showSwipeHandle
        >
          <DrawerContent>
            <DrawerHeader className="text-left">
              <DrawerTitle>{m.church_settings_preview_title()}</DrawerTitle>
            </DrawerHeader>
            <div className="overflow-y-auto p-4 pt-0">
              <ChurchPreview form={form} logoUrl={saved.logoUrl} />
            </div>
          </DrawerContent>
        </Drawer>
        <AlertDialog open={confirmingSlug} onOpenChange={setConfirmingSlug}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {m.church_settings_slug_confirm_title()}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {m.church_settings_slug_confirm_body({
                  old: saved.slug,
                  slug: form.slug.trim(),
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>
                {m.church_settings_slug_confirm_cancel()}
              </AlertDialogCancel>
              <AlertDialogAction onClick={save}>
                {m.church_settings_slug_confirm_action()}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {dirty ? (
          <SaveBar
            errorCount={errorCount}
            isSaving={saveSettings.isPending}
            onDiscard={() => {
              setForm(savedForm);
              setErrors({});
            }}
            onSave={save}
          />
        ) : null}
      </WorkspacePage>
    </FormControlSizeProvider>
  );
}

/** The Active Church's Church Settings: read, edit and save the whole set at once. */
export function ChurchSettingsPage() {
  const settings = useChurchSettings();

  if (settings.isPending) {
    return (
      <Pending className="space-y-3" label={m.church_settings_title()}>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </Pending>
    );
  }

  if (settings.isError) {
    return (
      <div className="space-y-3" role="alert">
        <p className="text-muted-foreground">
          {m.church_settings_load_failed()}
        </p>
        <Button variant="outline" onClick={() => settings.refetch()}>
          {m.church_settings_retry()}
        </Button>
      </div>
    );
  }

  return <ChurchSettingsEditor saved={settings.data} />;
}
