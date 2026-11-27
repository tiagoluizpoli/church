// PROTOTYPE (wayfinder #1093). Three variants of the service-day core, switchable via ?v=,
// every other Guardian screen via ?tela=. Fake data, nothing is saved.
import { useNavigate, useSearch } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight, SunMoon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect } from 'react';
import { CORE } from './core';
import { CoreAbc } from './core-abc';
import { FAMILY } from './family';
import { FLOWS } from './flows';
import { FormControlSizeProvider } from '@/components/ui/form-control-size';

const VARIANTS = {
  F: 'Final',
  A: 'Passe',
  B: 'Hoje no Kids',
  C: 'Linha do culto',
} as const;
type Key = keyof typeof VARIANTS;
const KEYS = Object.keys(VARIANTS) as Key[];

const SCREENS: [string, [string, string][]][] = [
  [
    'No culto (3 variantes)',
    [
      ['inicio', 'Início com check-in'],
      ['checkin', 'Check-in aberto'],
      ['codigo-retirada', 'Código de retirada'],
      ['chamada', 'Chamada (app aberto)'],
      ['chamada-notificacao', 'Chamada (pela notificação)'],
      ['chamada-de-novo', 'Chamada repetida'],
      ['inicio-a-caminho', 'Início: João a caminho'],
      ['checkin-a-caminho', 'Check-in: João a caminho'],
      ['escanear-segundo', 'Segundo ponto'],
      ['segundo-feito', 'Segundo ponto: entrou'],
      ['checkin-outro', 'Outro responsável'],
      ['checkin-mesa', 'Feito na mesa'],
      ['checkin-mudou', 'Mudou de sala'],
      ['inicio-duas', 'Duas famílias'],
      ['offline', 'Sem internet'],
    ],
  ],
  [
    'Primeiro contato',
    [
      ['ponto-deslogado', 'QR do ponto, deslogado'],
      ['criar-conta', 'Procurar igreja'],
      ['cadastro', 'Criar conta'],
      ['codigo-email', 'Código do e-mail'],
      ['perfil', 'Nome e celular'],
      ['criancas', 'Cadastrar crianças'],
      ['match', 'Criança já cadastrada'],
      ['pedido-enviado', 'Pedido enviado'],
    ],
  ],
  [
    'Check-in',
    [
      ['escanear', 'Escanear'],
      ['escanear-permissao', 'Pedindo câmera'],
      ['escanear-bloqueada', 'Câmera bloqueada'],
      ['vincular', 'Vincular outra igreja'],
      ['escolher', 'Escolher crianças'],
      ['entrar', 'Entrar'],
      ['escolher-novos', 'Escolher: recém-cadastradas'],
      ['confirmado-duas', 'Confirmação: duas famílias'],
      ['falha-checkin', 'Check-in falhou'],
      ['confirmado', 'Confirmação'],
      ['confirmado-ana', 'Confirmação: só a Ana'],
      ['avisos-ligar', 'Ligar avisos'],
      ['avisos-iphone', 'Avisos no iPhone'],
      ['foto', 'Pedir foto'],
      ['foto-primeira', 'Pedir foto (1º check-in)'],
    ],
  ],
  [
    'Família e conta',
    [
      ['familia', 'Família'],
      ['familia-sem-igreja', 'Família sem igreja'],
      ['crianca-nova', 'Nova criança'],
      ['sair-familia', 'Sair da família'],
      ['resgatar-confirmar', 'Resgatar: autorizar'],
      ['autorizado-cancelado', 'Código cancelado'],
      ['crianca', 'Criança'],
      ['historico', 'Histórico'],
      ['convidar', 'Convidar'],
      ['convite-recebido', 'Convite recebido'],
      ['convite-sem-conta', 'Convite sem conta'],
      ['convite-vencido', 'Convite vencido'],
      ['pedido', 'Pedido de entrada'],
      ['autorizar', 'Autorizar retirada'],
      ['autorizado', 'Link do autorizado'],
      ['resgatar', 'Resgatar cadastro'],
      ['conta', 'Minha conta'],
      ['sair-igreja', 'Sair da igreja'],
      ['remover-autorizado', 'Remover autorizado'],
      ['convite-enviado', 'Convite enviado'],
      ['autorizado-enviado', 'Código enviado'],
      ['resgatar-cadastro', 'Resgatar: criar conta'],
      ['familia-sem-prado', 'Família depois de sair'],
    ],
  ],
  [
    'Estados',
    [
      ['inicio-sem-familia', 'Início sem família'],
      ['inicio-sem-checkin', 'Início sem check-in'],
      ['chamada-resolvida', 'Chamada resolvida'],
      ['checkin-encerrado', 'Retirada feita'],
      ['checkin-nao-encerrado', 'Check-in não encerrado'],
      ['avisos', 'Notificações'],
      ['menu', 'Menu'],
    ],
  ],
];

export function GuardianPrototype() {
  const { tela, v } = useSearch({ from: '/prototype/kids' });
  const navigate = useNavigate();
  const { resolvedTheme, setTheme } = useTheme();
  const set = (next: { tela?: string; v?: Key }) =>
    navigate({ to: '/prototype/kids', search: { tela, v, ...next } });
  const cycle = (step: number) =>
    set({ v: KEYS[(KEYS.indexOf(v) + step + KEYS.length) % KEYS.length] });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest(
          'input, textarea, select, [contenteditable]',
        )
      )
        return;
      if (e.key === 'ArrowLeft') cycle(-1);
      if (e.key === 'ArrowRight') cycle(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const other =
    FLOWS[tela] ?? FAMILY[tela] ?? (v === 'F' ? CORE[tela] : undefined);

  return (
    <div className="flex h-dvh flex-col items-center">
      <nav
        aria-label="Controles do protótipo"
        className="flex w-full shrink-0 items-center gap-1 bg-black px-2 py-1 text-white text-xs"
      >
        <button
          type="button"
          className="grid size-9 place-items-center"
          aria-label="Variante anterior"
          onClick={() => cycle(-1)}
        >
          <ChevronLeft className="size-5" />
        </button>
        <span className="w-28 text-center">
          {v} · {VARIANTS[v]}
        </span>
        <button
          type="button"
          className="grid size-9 place-items-center"
          aria-label="Próxima variante"
          onClick={() => cycle(1)}
        >
          <ChevronRight className="size-5" />
        </button>
        <select
          aria-label="Tela"
          className="h-9 min-w-0 flex-1 bg-neutral-800 px-1"
          value={tela}
          onChange={(e) => set({ tela: e.target.value })}
          data-slot="select"
        >
          {SCREENS.map(([group, items]) => (
            <optgroup key={group} label={group}>
              {items.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button
          type="button"
          className="grid size-9 place-items-center"
          aria-label="Tema claro ou escuro"
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
        >
          <SunMoon className="size-5" />
        </button>
      </nav>
      <div className="flex min-h-0 w-full max-w-[430px] flex-1 flex-col border-x bg-background">
        <FormControlSizeProvider size="touch">
          <div key={`${tela}-${v}`} className="flex min-h-0 flex-1 flex-col">
            {other ?? <CoreAbc screen={tela} v={v === 'F' ? 'A' : v} />}
          </div>
        </FormControlSizeProvider>
      </div>
    </div>
  );
}
