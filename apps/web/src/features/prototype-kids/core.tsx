// PROTOTYPE (wayfinder #1093). The chosen service-day design: B's focused screen with the
// code button pinned in thumb reach, A's per-child spot lines, code page and full-screen Call.
import { BellRing, MapPin, QrCode, UserPlus, WifiOff } from 'lucide-react';
import { useState } from 'react';
import {
  CHILDREN,
  Heading,
  Initials,
  Notice,
  Panel,
  Phone,
  Qr,
  Row,
  useGo,
} from './kit';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

const { ana, joao } = CHILDREN;

export interface CheckinState {
  /** João still has to be taken to the point that serves his Room. */
  awaiting?: boolean;
  /** Who made the Check-in, seen from this phone. */
  maker?: 'me' | 'other' | 'desk';
  moved?: boolean;
  offline?: boolean;
}

function KidLine({
  child,
  awaiting,
  moved,
}: {
  child: typeof ana;
  awaiting?: boolean;
  moved?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <Initials name={child.name} />
      <div className="min-w-0 flex-1">
        <p className="font-bold">{child.first}</p>
        {awaiting ? (
          <p className="font-bold text-amber-700 dark:text-amber-400">
            A caminho: leve até o ponto Kids 5-13 · faltam 12 min
          </p>
        ) : (
          <p className="flex gap-1.5">
            <MapPin
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-primary"
            />
            Buscar no {moved ? 'ponto Kids 0-4 · sala Sensorial' : child.spot}
          </p>
        )}
      </div>
    </div>
  );
}

function BoardNumber({ n = 23 }: { n?: number }) {
  return (
    <p>
      Seu número no telão: <strong>{n}</strong>. Para retirar, use o código.
    </p>
  );
}

function CodeButton({
  to = 'codigo-retirada',
  label = 'Código de retirada',
}: {
  to?: string;
  label?: string;
}) {
  const go = useGo();
  return (
    <Button className="h-14 w-full shrink-0 text-base" onClick={() => go(to)}>
      <QrCode data-icon="inline-start" /> {label}
    </Button>
  );
}

function Offline() {
  return (
    <p className="flex items-center gap-2 text-muted-foreground text-xs">
      <WifiOff aria-hidden className="size-4" /> Sem internet · atualizado às
      10:42
    </p>
  );
}

/** Home card, one per open Check-in. */
export function CheckinCard({
  family,
  state = {},
}: {
  family?: 'Prado';
  state?: CheckinState;
}) {
  const go = useGo();
  return (
    <Panel>
      <h2 className="font-bold text-base">
        {family
          ? 'Léo está no Kids'
          : state.awaiting
            ? 'Ana está no Kids, João a caminho'
            : 'Ana e João estão no Kids'}
      </h2>
      {family ? (
        <KidLine
          child={{
            name: 'Léo Prado',
            first: 'Léo',
            age: '4 anos',
            spot: ana.spot,
          }}
        />
      ) : (
        <>
          <KidLine child={ana} moved={state.moved} />
          <KidLine child={joao} awaiting={state.awaiting} />
        </>
      )}
      <CodeButton
        label={family ? 'Código de retirada do Léo' : 'Código de retirada'}
      />
      <Button
        variant="ghost"
        className="w-full"
        onClick={() => go(state.awaiting ? 'checkin-a-caminho' : 'checkin')}
      >
        Ver check-in
      </Button>
      <BoardNumber n={family ? 24 : 23} />
    </Panel>
  );
}

export function Home({ two, state }: { two?: boolean; state?: CheckinState }) {
  return (
    <Phone>
      {state?.offline ? <Offline /> : null}
      <CheckinCard state={state} />
      {two ? <CheckinCard family="Prado" /> : null}
    </Phone>
  );
}

export function Checkin({
  awaiting,
  maker = 'me',
  moved,
  offline,
}: CheckinState) {
  const go = useGo();
  return (
    <Phone back="inicio" title="Hoje no Kids" footer={<CodeButton />}>
      {offline ? <Offline /> : null}
      <p className="text-muted-foreground">
        Domingo, culto das 10h ·{' '}
        {maker === 'me'
          ? 'você fez o check-in'
          : maker === 'other'
            ? 'Rafa fez o check-in'
            : 'check-in feito na mesa do Kids'}
      </p>
      {moved ? (
        <Notice tone="warn">
          <p>
            <strong>A Ana foi para a sala Sensorial.</strong> Na saída, venha ao
            ponto Kids 0-4.
          </p>
        </Notice>
      ) : null}
      <Panel>
        <KidLine child={ana} moved={moved} />
      </Panel>
      <Panel>
        <KidLine child={joao} awaiting={awaiting} />
        {awaiting ? (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => go('escanear-segundo')}
          >
            Escanear o ponto Kids 5-13
          </Button>
        ) : null}
      </Panel>
      <BoardNumber />
      <Notice>
        <p>
          <strong>Notificações desligadas.</strong> A sala só consegue te chamar
          com o app aberto ou pelo telão.
        </p>
        <Button variant="outline" onClick={() => go('avisos-ligar')}>
          Ligar notificações
        </Button>
      </Notice>
      <Panel>
        {/* biome-ignore lint/a11y/noLabelWithoutControl: the Switch is the control */}
        <label className="flex min-h-11 items-center justify-between gap-3">
          <span>
            <span className="block font-bold">
              Receber chamadas deste check-in
            </span>
            <span className="block text-muted-foreground text-sm">
              {maker !== 'other'
                ? 'Quem fez o check-in sempre recebe.'
                : 'Pode desligar: quem fez o check-in continua recebendo.'}
            </span>
          </span>
          <Switch defaultChecked disabled={maker !== 'other'} />
        </label>
        <Row
          title="Joana Lima"
          detail="Autorizada até 31/12"
          action={
            <Button variant="outline" onClick={() => go('autorizado')}>
              Enviar código
            </Button>
          }
        />
        <Button
          variant="outline"
          className="w-full"
          onClick={() => go('autorizar')}
        >
          <UserPlus data-icon="inline-start" /> Autorizar outra pessoa
        </Button>
      </Panel>
    </Phone>
  );
}

/** The door artifact: the code and the Children are large, the Call number is not here to be mistaken. */
export function PickupCode() {
  const go = useGo();
  return (
    <Phone back="checkin" title="Código de retirada">
      <Heading sub="Mostre para a equipe na hora de buscar.">
        Ana e João
      </Heading>
      <Qr className="mx-auto w-full max-w-72" />
      <p className="text-center font-bold font-mono text-3xl tracking-widest">
        K7Q-4MX
      </p>
      <p className="flex items-center justify-center gap-2 text-muted-foreground text-xs">
        <WifiOff aria-hidden className="size-4" /> Funciona sem internet ·
        atualizado às 10:42
      </p>
      <Notice>
        <p>
          Coloque sua foto: a retirada fica mais rápida e mais segura, e ajuda a
          equipe do Kids.
        </p>
        <Button variant="outline" onClick={() => go('foto')}>
          Adicionar foto
        </Button>
      </Notice>
    </Phone>
  );
}

type Answer = 'ringing' | 'going' | 'cant';

const REASON = '“Está chorando e pedindo pela mãe há alguns minutos.”';

/** `alert`: app already open (full screen). Otherwise: opened from the push notification. */
export function Call({ alert, again }: { alert?: boolean; again?: boolean }) {
  const go = useGo();
  const [answer, setAnswer] = useState<Answer>('ringing');

  if (answer !== 'ringing')
    return (
      <Phone back="checkin" title="Chamada da Ana">
        {answer === 'going' ? (
          <>
            <Heading sub="A equipe foi avisada.">
              Venha até o {ana.spot}
            </Heading>
            <p className="radius-surface border bg-card p-3">{REASON}</p>
            <CodeButton />
            <Button variant="outline" onClick={() => setAnswer('cant')}>
              Não vou conseguir ir
            </Button>
          </>
        ) : (
          <>
            <Heading sub="Os outros responsáveis que recebem chamadas também foram avisados. Se puder, combine com um deles.">
              A equipe sabe que você não pode ir
            </Heading>
            <p className="radius-surface border bg-card p-3">{REASON}</p>
            <Button onClick={() => setAnswer('going')}>
              Agora posso: estou indo
            </Button>
          </>
        )}
        <Button variant="ghost" onClick={() => go('chamada-resolvida')}>
          (protótipo) a equipe resolveu a chamada
        </Button>
      </Phone>
    );

  const answers = (
    <>
      <Button
        autoFocus
        className="h-14 text-base"
        onClick={() => setAnswer('going')}
      >
        Estou indo
      </Button>
      <Button
        className="h-12"
        variant="outline"
        onClick={() => setAnswer('cant')}
      >
        Não posso ir
      </Button>
    </>
  );
  const body = (
    <>
      <p className="text-balance text-lg">Venha até o {ana.spot}</p>
      <p className="radius-surface border bg-card p-3 text-base">{REASON}</p>
      {again ? (
        <p className="font-bold">
          Segunda chamada. Se ninguém responder, o telão mostra “23 · Ana”.
        </p>
      ) : null}
      <p className="text-muted-foreground text-xs">
        Chamada às {again ? '10:41' : '10:38'}
      </p>
    </>
  );
  const title = (
    <h1
      id="call-title"
      className="text-balance font-bold text-3xl leading-tight"
    >
      A Ana precisa de você
    </h1>
  );

  if (!alert)
    return (
      <Phone back="checkin" title="Chamada" footer={answers}>
        <BellRing aria-hidden className="size-10 text-amber-600" />
        {title}
        {body}
      </Phone>
    );

  return (
    <Phone bare footer={answers}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="call-title"
        className="-m-4 flex flex-1 flex-col justify-center gap-5 bg-amber-500/15 p-6 text-center"
      >
        <span
          aria-hidden
          className="mx-auto grid size-24 place-items-center rounded-full bg-amber-500 text-black motion-safe:animate-pulse"
        >
          <BellRing className="size-12" />
        </span>
        {title}
        {body}
      </div>
    </Phone>
  );
}

export const CORE: Record<string, React.ReactNode> = {
  inicio: <Home />,
  'inicio-a-caminho': <Home state={{ awaiting: true }} />,
  'inicio-duas': <Home two />,
  offline: <Home state={{ offline: true }} />,
  checkin: <Checkin />,
  'checkin-a-caminho': <Checkin awaiting />,
  'checkin-outro': <Checkin maker="other" />,
  'checkin-mesa': <Checkin maker="desk" />,
  'checkin-mudou': <Checkin moved />,
  'codigo-retirada': <PickupCode />,
  chamada: <Call alert />,
  'chamada-notificacao': <Call />,
  'chamada-de-novo': <Call alert again />,
};
