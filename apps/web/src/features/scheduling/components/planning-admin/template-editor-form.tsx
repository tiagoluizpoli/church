import { getLocale } from '@church/i18n/runtime';
import { formatWeekdayOfIndex } from '@church/time';
import { useTemplateEditor } from './planning-admin-context';
import { TemplateTimeBlockRow } from './template-time-block-row';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface TemplateEditorFormProps {
  submitButtonClassName?: string;
}

export function TemplateEditorForm({
  submitButtonClassName,
}: TemplateEditorFormProps) {
  const {
    editingTemplateId,
    templateForm,
    canCreateTemplate,
    saveTemplatePending,
    handleTemplateNameChange,
    handleTemplateWeekdayChange,
    handleTemplateTimeBlockChange,
    handleRemoveTemplateTimeBlock,
    handleAddTemplateTimeBlock,
    handleSaveTemplate,
  } = useTemplateEditor();
  const selectedWeekdayIndex = Number.parseInt(templateForm.weekday, 10);
  const selectedWeekdayLabel = Number.isNaN(selectedWeekdayIndex)
    ? null
    : formatWeekdayOfIndex({
        index: selectedWeekdayIndex as 0 | 1 | 2 | 3 | 4 | 5 | 6,
        locale: getLocale(),
      });

  return (
    <div className="space-y-4">
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
        <Label>Weekday</Label>
        <Select
          value={templateForm.weekday}
          onValueChange={(weekday) => {
            if (weekday !== null) {
              handleTemplateWeekdayChange({ weekday });
            }
          }}
        >
          <SelectTrigger
            id="template-weekday-select"
            aria-label="Weekday"
            data-testid="template-weekday-select"
            className="w-full"
          >
            <SelectValue placeholder="Select a weekday">
              {selectedWeekdayLabel}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {([0, 1, 2, 3, 4, 5, 6] as const).map((index) => (
              <SelectItem
                key={index}
                value={String(index)}
                data-testid={`template-weekday-option-${index}`}
              >
                {formatWeekdayOfIndex({ index, locale: getLocale() })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        {templateForm.blocks.map((block, index) => (
          <TemplateTimeBlockRow
            key={block.id}
            block={block}
            index={index}
            totalBlocks={templateForm.blocks.length}
            onBlockChange={handleTemplateTimeBlockChange}
            onRemoveBlock={handleRemoveTemplateTimeBlock}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="add-template-time-block-button"
          onClick={handleAddTemplateTimeBlock}
        >
          Add block
        </Button>
        <Button
          type="button"
          data-testid="create-template-button"
          className={submitButtonClassName}
          disabled={!canCreateTemplate || saveTemplatePending}
          onClick={handleSaveTemplate}
        >
          {saveTemplatePending
            ? editingTemplateId
              ? 'Saving…'
              : 'Creating…'
            : editingTemplateId
              ? 'Save changes'
              : 'Create template'}
        </Button>
      </div>
    </div>
  );
}
