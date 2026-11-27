// PROTOTYPE (wayfinder #1093). Service-day core: three structurally different takes.
// A "Passe": the Check-in is one pass object that flips to its code.
// B "Hoje no Kids": a focused screen with actions pinned in thumb reach.
// C "Linha do culto": the Check-in as a timeline; what happens next is on top.
import {
  BellRing,
  Check as CheckIcon,
  MapPin,
  QrCode,
  UserPlus,
  WifiOff,
} from 'lucide-react';
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
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

const KIDS = [CHILDREN.ana, CHILDREN.joao];

function PushBanner() {
  const go = useGo();
  return (
    <Notice tone="warn">
      <p>
        <strong>Avisos desligados.</strong> A sala só consegue te chamar com o
        app aberto ou pelo telão.
      </p>
      <Button variant="outline" onClick={() => go('avisos-ligar')}>
        Ligar avisos
      </Button>
    </Notice>
  );
}

function CallsSwitch() {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the Switch is the control
    <label className="flex min-h-11 items-center justify-between gap-3">
      <span>
        <span className="block font-bold">Receber chamadas</span>
        <span className="block text-muted-foreground text-xs">
          Você fez o check-in, então fica sempre ligado.
        </span>
      </span>
      <Switch defaultChecked disabled />
    </label>
  );
}

function SecondaryActions() {
  const go = useGo();
  return (
    <>
      <CallsSwitch />
      <Button variant="outline" onClick={() => go('autorizar')}>
        <UserPlus data-icon="inline-start" /> Autorizar outra pessoa a retirar
      </Button>
    </>
  );
}

function CodeCard({ big }: { big?: boolean }) {
  return (
    <div className="space-y-3 text-center">
      <Qr className={cn('mx-auto', big ? 'max-w-72' : 'max-w-56')} />
      <p className="font-bold font-mono text-2xl tracking-widest">K7Q-4MX</p>
      <p className="text-muted-foreground">
        Mostre para a equipe na hora de buscar.
      </p>
      <p className="flex items-center justify-center gap-2 text-muted-foreground text-xs">
        <WifiOff className="size-4" /> Funciona sem internet · atualizado às
        10:42
      </p>
    </div>
  );
}

function PhotoNudge() {
  const go = useGo();
  return (
    <Notice>
      <p>
        Coloque sua foto: a retirada fica mais rápida e mais segura, e ajuda a
        equipe do Kids.
      </p>
      <Button variant="outline" onClick={() => go('foto')}>
        Adicionar foto
      </Button>
    </Notice>
  );
}

/* ---------- A: Passe ---------- */

function Pass({ flipped, onFlip }: { flipped: boolean; onFlip: () => void }) {
  return (
    <section className="radius-surface overflow-hidden border bg-card">
      <div className="flex items-end justify-between gap-3 bg-primary p-4 text-primary-foreground">
        <div>
          <p className="text-xs">Kids · domingo, culto das 10h</p>
          <p className="font-bold text-lg">Ana e João</p>
        </div>
        <p className="font-bold text-5xl tabular-nums leading-none">
          <span className="mr-1 text-base">nº</span>23
        </p>
      </div>
      <div className="space-y-3 p-4">
        {flipped ? (
          <CodeCard />
        ) : (
          KIDS.map((c) => (
            <Row
              key={c.first}
              lead={<Initials name={c.name} />}
              title={c.first}
              detail={`Buscar no ${c.spot}`}
            />
          ))
        )}
      </div>
      <div className="border-t border-dashed p-4">
        <Button
          className="h-14 w-full text-base"
          onClick={onFlip}
          aria-pressed={flipped}
        >
          <QrCode data-icon="inline-start" />
          {flipped ? 'Voltar para as crianças' : 'Código de retirada'}
        </Button>
      </div>
    </section>
  );
}

function HomeA() {
  const go = useGo();
  const [flipped, setFlipped] = useState(false);
  return (
    <Phone>
      <Pass flipped={flipped} onFlip={() => setFlipped(!flipped)} />
      <Button variant="ghost" onClick={() => go('checkin')}>
        Ver detalhes do check-in
      </Button>
      <h2 className="font-bold">Sua semana</h2>
      <Panel>
        <Row
          title="Nada pendente na escala"
          detail="Quando houver, aparece aqui."
        />
      </Panel>
    </Phone>
  );
}

function CheckinA() {
  const [flipped, setFlipped] = useState(false);
  return (
    <Phone back="inicio" title="Check-in de hoje">
      <PushBanner />
      <Pass flipped={flipped} onFlip={() => setFlipped(!flipped)} />
      <Panel>
        <SecondaryActions />
      </Panel>
      <PhotoNudge />
    </Phone>
  );
}

function CodeA() {
  return (
    <Phone back="checkin" title="Código de retirada">
      <Heading sub="Ana e João">nº 23</Heading>
      <CodeCard big />
      <PhotoNudge />
    </Phone>
  );
}

/* ---------- B: Hoje no Kids ---------- */

function HomeB() {
  const go = useGo();
  return (
    <Phone>
      <button
        type="button"
        onClick={() => go('checkin')}
        className="radius-surface flex min-h-16 items-center gap-3 border border-primary/30 bg-primary/8 p-3 text-left"
      >
        <span className="font-bold text-2xl tabular-nums">23</span>
        <span className="flex-1">
          <span className="block font-bold">Ana e João estão no Kids</span>
          <span className="block text-muted-foreground text-xs">
            Toque para ver
          </span>
        </span>
      </button>
      <Button
        size="touch"
        className="h-14 text-base"
        onClick={() => go('codigo-retirada')}
      >
        <QrCode data-icon="inline-start" /> Código de retirada
      </Button>
      <h2 className="font-bold">Sua semana</h2>
      <Panel>
        <Row
          title="Nada pendente na escala"
          detail="Quando houver, aparece aqui."
        />
      </Panel>
    </Phone>
  );
}

function CheckinB({ startOpen = false }: { startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  return (
    <Phone
      back="inicio"
      title="Hoje no Kids"
      footer={
        <Button className="h-14 text-base" onClick={() => setOpen(true)}>
          <QrCode data-icon="inline-start" /> Código de retirada
        </Button>
      }
    >
      <Heading sub="Domingo, culto das 10h">Número de chamada 23</Heading>
      <PushBanner />
      {KIDS.map((c) => (
        <Panel key={c.first}>
          <Row
            lead={<Initials name={c.name} />}
            title={c.name}
            detail={`Entrou às 9:51 · ${c.age}`}
          />
          <p className="flex gap-2">
            <MapPin className="mt-0.5 size-4 shrink-0 text-primary" /> Buscar no{' '}
            {c.spot}
          </p>
        </Panel>
      ))}
      <SecondaryActions />
      <Drawer open={open} onOpenChange={setOpen} showSwipeHandle>
        <DrawerContent>
          <div className="space-y-3 overflow-y-auto p-4 pb-8 text-sm">
            <DrawerTitle className="text-center text-lg">
              Retirada · nº 23
            </DrawerTitle>
            <DrawerDescription className="text-center text-sm">
              Ana e João
            </DrawerDescription>
            <CodeCard big />
            <Button
              size="touch"
              variant="outline"
              className="w-full"
              onClick={() => setOpen(false)}
            >
              Fechar
            </Button>
          </div>
        </DrawerContent>
      </Drawer>
    </Phone>
  );
}

/* ---------- C: Linha do culto ---------- */

function Station({
  done,
  current,
  title,
  detail,
  children,
}: {
  done?: boolean;
  current?: boolean;
  title: string;
  detail?: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0 [&:not(:last-child)]:before:absolute [&:not(:last-child)]:before:top-7 [&:not(:last-child)]:before:bottom-0 [&:not(:last-child)]:before:left-3 [&:not(:last-child)]:before:w-0.5 [&:not(:last-child)]:before:bg-border">
      <span
        className={cn(
          'mt-0.5 grid size-6.5 shrink-0 place-items-center rounded-full border-2',
          done && 'border-primary bg-primary text-primary-foreground',
          current && 'border-primary bg-background ring-4 ring-primary/15',
          !(done || current) && 'border-border bg-background',
        )}
      >
        {done ? <CheckIcon className="size-4" /> : null}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <p className="font-bold">{title}</p>
          {detail ? (
            <p className="text-muted-foreground text-xs">{detail}</p>
          ) : null}
        </div>
        {children}
      </div>
    </li>
  );
}

function Timeline({ call, openCode }: { call?: boolean; openCode?: boolean }) {
  const go = useGo();
  const [code, setCode] = useState(Boolean(openCode));
  return (
    <ol>
      <Station
        done
        title="Check-in feito às 9:51"
        detail="nº 23 · Ana e João"
      />
      <Station done title="João entregue no ponto Kids 5-13" detail="9:55" />
      {call ? (
        <Station current title="A Ana precisa de você" detail="10:38">
          <Button className="w-full" onClick={() => go('chamada')}>
            <BellRing data-icon="inline-start" /> Responder
          </Button>
        </Station>
      ) : (
        <Station
          current
          title="No Kids agora"
          detail="Se precisarem de você, o celular avisa."
        >
          {KIDS.map((c) => (
            <p key={c.first} className="text-xs">
              <strong>{c.first}</strong>: buscar no {c.spot}
            </p>
          ))}
        </Station>
      )}
      <Station title="Retirada" detail="Na saída, mostre o código.">
        <Button
          className="h-14 w-full text-base"
          aria-expanded={code}
          onClick={() => setCode(!code)}
        >
          <QrCode data-icon="inline-start" />{' '}
          {code ? 'Esconder código' : 'Código de retirada'}
        </Button>
        {code ? <CodeCard /> : null}
      </Station>
    </ol>
  );
}

function HomeC() {
  return (
    <Phone>
      <Heading sub="Domingo, culto das 10h">Kids agora · nº 23</Heading>
      <Timeline />
      <h2 className="font-bold">Sua semana</h2>
      <Panel>
        <Row
          title="Nada pendente na escala"
          detail="Quando houver, aparece aqui."
        />
      </Panel>
    </Phone>
  );
}

function CheckinC({ openCode }: { openCode?: boolean }) {
  return (
    <Phone back="inicio" title="Check-in de hoje">
      <Heading sub="Domingo, culto das 10h">nº 23 · Ana e João</Heading>
      <PushBanner />
      <Timeline openCode={openCode} />
      <Panel>
        <SecondaryActions />
      </Panel>
    </Phone>
  );
}

/* ---------- Incoming Call ---------- */

type Answer = 'ringing' | 'going' | 'cant';

function Call({ variant }: { variant: 'A' | 'B' | 'C' }) {
  const go = useGo();
  const [answer, setAnswer] = useState<Answer>('ringing');
  const child = CHILDREN.ana;

  if (answer !== 'ringing')
    return (
      <Phone back="checkin" title="Chamada">
        {answer === 'going' ? (
          <>
            <Heading sub="A equipe foi avisada.">
              Venha até o {child.spot}
            </Heading>
            <Button variant="outline" onClick={() => go('codigo-retirada')}>
              <QrCode data-icon="inline-start" /> Código de retirada
            </Button>
          </>
        ) : (
          <Heading sub="Se puder, peça a outro responsável. Todos eles também receberam a chamada.">
            Avisamos a equipe que você não pode ir
          </Heading>
        )}
        <Button variant="ghost" onClick={() => go('chamada-resolvida')}>
          (protótipo) a equipe resolveu a chamada
        </Button>
      </Phone>
    );

  const answers = (
    <>
      <Button className="h-14 text-base" onClick={() => setAnswer('going')}>
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
  const reason = (
    <p className="radius-surface border bg-card p-3 text-base">
      “Está chorando e pedindo pela mãe há alguns minutos.”
    </p>
  );

  if (variant === 'C')
    return (
      <Phone back="checkin" title="Chamada">
        <Notice tone="warn">
          <p className="font-bold text-lg">A Ana precisa de você</p>
          <p>Venha até o {child.spot}</p>
          {reason}
          <div className="grid gap-2">{answers}</div>
        </Notice>
        <Timeline call />
      </Phone>
    );

  if (variant === 'B')
    return (
      <Phone back="checkin" title="Hoje no Kids" footer={answers}>
        <div className="flex-1" />
        <div
          role="alertdialog"
          aria-label="Chamada do Kids"
          className="space-y-3"
        >
          <BellRing className="size-10 text-amber-600 motion-safe:animate-pulse" />
          <Heading sub={`Venha até o ${child.spot}`}>
            A Ana precisa de você
          </Heading>
          {reason}
        </div>
      </Phone>
    );

  return (
    <Phone bare footer={answers}>
      <div
        role="alertdialog"
        aria-label="Chamada do Kids"
        className="-m-4 flex flex-1 flex-col justify-center gap-5 bg-amber-500/15 p-6 text-center"
      >
        <span className="mx-auto grid size-24 place-items-center rounded-full bg-amber-500 text-black motion-safe:animate-pulse">
          <BellRing className="size-12" />
        </span>
        <h1 className="text-balance font-bold text-3xl leading-tight">
          A Ana precisa de você
        </h1>
        <p className="text-balance text-lg">Venha até o {child.spot}</p>
        {reason}
        <p className="text-muted-foreground">Chamada às 10:38 · nº 23</p>
      </div>
    </Phone>
  );
}

export function CoreAbc({ screen, v }: { screen: string; v: 'A' | 'B' | 'C' }) {
  if (screen === 'chamada') return <Call key={v} variant={v} />;
  if (v === 'A') {
    if (screen === 'checkin') return <CheckinA />;
    if (screen === 'codigo-retirada') return <CodeA />;
    return <HomeA />;
  }
  if (v === 'B') {
    if (screen === 'checkin') return <CheckinB />;
    if (screen === 'codigo-retirada') return <CheckinB startOpen />;
    return <HomeB />;
  }
  if (screen === 'checkin') return <CheckinC />;
  if (screen === 'codigo-retirada') return <CheckinC openCode />;
  return <HomeC />;
}
