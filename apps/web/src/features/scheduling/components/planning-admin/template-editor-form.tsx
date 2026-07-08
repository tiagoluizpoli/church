import { WEEKDAYS } from './planning-admin.utils';
import { useTemplateEditor } from './planning-admin-context';
import { TemplateBlockRow } from './template-block-row';
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
    handleTemplateBlockChange,
    handleRemoveTemplateBlock,
    handleAddTemplateBlock,
    handleSaveTemplate,
  } = useTemplateEditor();
  const selectedWeekdayLabel =
    WEEKDAYS[Number.parseInt(templateForm.weekday, 10)] ?? null;

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
            {WEEKDAYS.map((weekday, index) => (
              <SelectItem
                key={weekday}
                value={String(index)}
                data-testid={`template-weekday-option-${index}`}
              >
                {weekday}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
