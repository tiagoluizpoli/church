import { m } from '@church/i18n/messages';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  type PrecedenceAnswer,
  PrecedenceAnswerRadios,
} from './precedence-answer-radios';
import { RetryAlert } from './retry-alert';
import { templatePrecedencesQueryKey } from './template-query-keys';
import { Pending } from '@/components/ui/pending';
import { Skeleton } from '@/components/ui/skeleton';
import { adminApi } from '@/utils/api-instances';

export interface TemplatePrecedenceListProps {
  templateId: string;
}

interface ChangeInput {
  otherTemplateId: string;
  answer: PrecedenceAnswer;
}

/** The template's stored precedences; each answer changes on its own, without editing either template. The surrounding dialog carries the title. */
export function TemplatePrecedenceList({
  templateId,
}: TemplatePrecedenceListProps) {
  const queryClient = useQueryClient();
  const queryKey = templatePrecedencesQueryKey({ templateId });
  const query = useQuery({
    queryKey,
    queryFn: () => adminApi.listTemplatePrecedences(templateId),
  });
  const change = useMutation({
    mutationFn: ({ otherTemplateId, answer }: ChangeInput) =>
      adminApi.changeTemplatePrecedence(templateId, otherTemplateId, {
        answer,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      toast.success(m.event_templates_precedence_changed_toast());
    },
    onError: () => toast.error(m.event_templates_precedence_change_failed()),
  });

  return (
    <div className="space-y-3" data-testid="template-precedences">
      {query.data ? (
        query.data.precedences.length === 0 ? (
          <p
            className="text-muted-foreground text-sm"
            data-testid="template-precedences-empty"
          >
            {m.event_templates_precedences_empty()}
          </p>
        ) : (
          <ul className="space-y-3">
            {query.data.precedences.map((precedence) => (
              <li
                key={precedence.otherTemplateId}
                data-testid="template-precedence-row"
              >
                <fieldset className="space-y-1">
                  <legend className="font-medium text-sm">
                    {precedence.otherTemplateName}
                  </legend>
                  <PrecedenceAnswerRadios
                    idPrefix={`precedence-${precedence.otherTemplateId}`}
                    name={precedence.otherTemplateName}
                    value={precedence.answer}
                    disabled={change.isPending}
                    onChange={(answer) =>
                      change.mutate({
                        otherTemplateId: precedence.otherTemplateId,
                        answer,
                      })
                    }
                  />
                </fieldset>
              </li>
            ))}
          </ul>
        )
      ) : query.isError ? (
        <RetryAlert
          message={m.event_templates_precedences_load_failed()}
          testId="template-precedences-error"
          onRetry={() => query.refetch()}
        />
      ) : (
        <Pending label={m.event_templates_precedences_loading()}>
          <Skeleton className="h-10 w-full" />
        </Pending>
      )}
    </div>
  );
}
