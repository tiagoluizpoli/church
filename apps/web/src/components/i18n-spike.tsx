import { greeting, people_needed } from '@church/i18n/messages';

interface I18nSpikeProps {
  name: string;
  count: number;
}

// Spike #395: a component that reads the ambient locale, with no provider.
export function I18nSpike({ name, count }: I18nSpikeProps) {
  return (
    <p>
      {greeting({ name })} · {people_needed({ count })}
    </p>
  );
}
