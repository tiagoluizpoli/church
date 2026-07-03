import { Button } from '@church/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@church/ui/components/card';
import { Input } from '@church/ui/components/input';
import { Label } from '@church/ui/components/label';
import { Separator } from '@church/ui/components/separator';
import { describeTemplate, WEEKDAYS } from './planning-admin.utils';
import { useTemplateManagerCard } from './planning-admin-context';
import { TemplateBlockRow } from './template-block-row';

export function TemplateManagerCard() {
  const {
    templateForm,
    templates,
    selectedTemplateIds,
    selectedCycleId,
    canCreateTemplate,
    templatesLoading,
    createTemplatePending,
    deleteTemplatePending,
    applyTemplatesPending,
    handleTemplateNameChange,
    handleTemplateWeekdayChange,
    handleTemplateBlockChange,
    handleRemoveTemplateBlock,
    handleAddTemplateBlock,
    handleSaveTemplate,
    handleToggleTemplateSelection,
    handleDeleteTemplate,
    handleApplyTemplates,
  } = useTemplateManagerCard();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Event templates</CardTitle>
        <CardDescription>
          Build reusable weekday templates, then choose which ones to apply to
          the selected cycle.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="template-name">Template name</Label>
          <Input
            id="template-name"
            data-testid="template-name-input"
            value={templateForm.name}
            onChange={(event) =>
              handleTemplateNameChange({ name: event.target.value })
            }
            placeholder="Sunday Service"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="template-weekday">Weekday</Label>
          <select
            id="template-weekday"
            data-testid="template-weekday-select"
            className="flex h-8 w-full border bg-background px-2.5 text-sm"
            value={templateForm.weekday}
            onChange={(event) =>
              handleTemplateWeekdayChange({ weekday: event.target.value })
            }
          >
            {WEEKDAYS.map((weekday, index) => (
              <option key={weekday} value={String(index)}>
                {weekday}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-3">
          {templateForm.blocks.map((block, index) => (
            <TemplateBlockRow
              key={block.id}
              block={block}
              index={index}
              totalBlocks={templateForm.blocks.length}
              onBlockChange={handleTemplateBlockChange}
              onRemoveBlock={handleRemoveTemplateBlock}
            />
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="add-template-block-button"
            onClick={handleAddTemplateBlock}
          >
            Add block
          </Button>
          <Button
            type="button"
            data-testid="create-template-button"
            disabled={!canCreateTemplate || createTemplatePending}
            onClick={handleSaveTemplate}
          >
            {createTemplatePending ? 'Saving…' : 'Save template'}
          </Button>
        </div>

        <Separator />

        <div className="space-y-3">
          {templatesLoading ? (
            <p className="text-muted-foreground text-sm">Loading templates…</p>
          ) : templates.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No templates yet. Save one above to generate recurring events.
            </p>
          ) : (
            templates.map((template) => (
              <div
                key={template.id}
                className="flex items-start justify-between gap-3 border p-3"
                data-testid="saved-template-row"
              >
                <label className="flex flex-1 items-start gap-3">
                  <input
                    type="checkbox"
                    data-testid="template-select-checkbox"
                    checked={selectedTemplateIds.includes(template.id)}
                    onChange={(event) =>
                      handleToggleTemplateSelection({
                        templateId: template.id,
                        checked: event.target.checked,
                      })
                    }
                  />
                  <div className="space-y-1">
                    <div className="font-medium">{template.name}</div>
                    <div className="text-muted-foreground text-xs">
                      {describeTemplate({ template })}
                    </div>
                  </div>
                </label>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  disabled={deleteTemplatePending}
                  onClick={() =>
                    handleDeleteTemplate({ templateId: template.id })
                  }
                >
                  Delete
                </Button>
              </div>
            ))
          )}
        </div>

        <Button
          type="button"
          data-testid="apply-templates-button"
          disabled={
            selectedCycleId === null ||
            selectedTemplateIds.length === 0 ||
            applyTemplatesPending
          }
          onClick={handleApplyTemplates}
        >
          {applyTemplatesPending ? 'Applying…' : 'Apply to selected cycle'}
        </Button>
      </CardContent>
    </Card>
  );
}
