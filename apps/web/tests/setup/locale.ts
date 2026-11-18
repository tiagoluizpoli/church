import { overwriteGetLocale } from '@church/i18n/runtime';

// Tests render in pt-BR, the shipped default locale.
overwriteGetLocale(() => 'pt-BR');
