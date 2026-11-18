export const TEMPLATE_LIST_QUERY_KEY = ['planning-templates'] as const;

/**
 * Root of every Usual setup read. Template edits and deletes change which
 * blocks a Usual setup references, so they invalidate everything below it.
 */
export const USUAL_SETUP_QUERY_KEY = ['usual-setup'] as const;

interface TemplateQueryKeyInput {
  templateId: string;
}

export function templateDetailQueryKey({ templateId }: TemplateQueryKeyInput) {
  return ['planning-template', templateId] as const;
}

export function templateUsageQueryKey({ templateId }: TemplateQueryKeyInput) {
  return ['planning-template-usage', templateId] as const;
}
