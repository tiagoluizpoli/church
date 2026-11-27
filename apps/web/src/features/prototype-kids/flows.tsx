// PROTOTYPE (wayfinder #1093). Sign-up, first check-in and coaching screens (one design each).
import { Camera, CircleCheck, Share, SquarePlus } from 'lucide-react';
import { useState } from 'react';
import {
  Check,
  Field,
  Heading,
  Initials,
  Notice,
  Panel,
  Phone,
  Row,
  useGo,
} from './kit';
import { Button } from '@/components/ui/button';

function Primary({
  to,
  children,
  disabled,
}: {
  to: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const go = useGo();
  return (
    <Button
      className="h-12 shrink-0 text-base"
      disabled={disabled}
      onClick={() => go(to)}
    >
      {children}
    </Button>
  );
}

function Secondary({
  to,
  children,
  variant = 'outline',
}: {
  to: string;
  children: React.ReactNode;
  variant?: 'outline' | 'ghost';
}) {
  const go = useGo();
  return (
    <Button className="shrink-0" variant={variant} onClick={() => go(to)}>
      {children}
    </Button>
  );
}

function SignedOutPoint() {
  return (
    <Phone bare>
      <Heading sub="Ponto Kids 0-4 · Igreja Semente">
        Entre para fazer o check-in
      </Heading>
      <p>
        Leva uns dois minutos na primeira vez. Depois, é só apontar a câmera.
      </p>
      <Primary to="cadastro">Criar minha conta</Primary>
      <Secondary to="entrar">Já tenho conta: entrar</Secondary>
      <Notice>
        <p>
          Sem sinal ou sem tempo? Fale com a equipe na mesa do Kids, ela faz o
          check-in para você.
        </p>
      </Notice>
    </Phone>
  );
}

function SignUp({ next = 'perfil' }: { next?: string }) {
  return (
    <Phone bare>
      <p className="text-muted-foreground text-xs">
        Depois do cadastro você volta para o ponto Kids 0-4.
      </p>
      <Heading sub="Você vai fazer parte da Igreja Semente.">
        Criar conta
      </Heading>
      <Primary to={next}>Cadastrar com Google</Primary>
      <p className="text-center text-muted-foreground">ou com e-mail</p>
      <Field
        label="E-mail"
        type="email"
        autoComplete="email"
        inputMode="email"
      />
      <Field
        label="Senha"
        type="password"
        autoComplete="new-password"
        hint="Pelo menos 8 caracteres."
      />
      <Secondary to="codigo-email">Continuar com e-mail</Secondary>
    </Phone>
  );
}

function EmailCode() {
  return (
    <Phone back="cadastro" title="Confirmar e-mail" plain>
      <Heading sub="Enviamos 6 números para carla@exemplo.com.">
        Digite o código
      </Heading>
      <Field
        label="Código"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        className="text-center font-mono text-2xl tracking-[0.5em]"
      />
      <Primary to="perfil">Confirmar</Primary>
      <Button variant="ghost">Não chegou? Reenviar</Button>
    </Phone>
  );
}

function Profile() {
  return (
    <Phone back="cadastro" title="Seus dados" plain>
      <Field label="Seu nome" defaultValue="Carla Souza" autoComplete="name" />
      <Field
        label="Celular"
        type="tel"
        autoComplete="tel"
        placeholder="(11) 91234-5678"
        hint="Obrigatório. A equipe usa se precisar falar com você."
      />
      <Check>Quero receber novidades por WhatsApp ou SMS</Check>
      <p className="text-muted-foreground text-xs">
        Ao se cadastrar você passa a fazer parte da Igreja Semente e aceita os{' '}
        <u>termos</u> e o <u>aviso de privacidade</u>.
      </p>
      <Primary to="criancas">Concluir cadastro</Primary>
    </Phone>
  );
}

function Children() {
  const [consent, setConsent] = useState(false);
  return (
    <Phone
      back="perfil"
      plain
      title="Seus filhos"
      footer={
        <Primary to="match" disabled={!consent}>
          Salvar e continuar
        </Primary>
      }
    >
      <Heading sub="Só nome e nascimento agora.">
        Quem vai ficar no Kids?
      </Heading>
      <Panel>
        <Field label="Nome completo da criança" defaultValue="Ana Souza" />
        <Field
          label="Data de nascimento"
          type="date"
          defaultValue="2023-03-14"
        />
      </Panel>
      <Button variant="outline">Adicionar outra criança</Button>
      <Panel className="border-primary/40">
        <Check
          checked={consent}
          onCheckedChange={(v) => setConsent(v === true)}
          hint="Usados só para o check-in e a segurança no Kids. Você pode apagar depois."
        >
          <strong>Autorizo</strong> o uso dos dados dos meus filhos pela
          plataforma e pelas igrejas que eu vincular.
        </Check>
      </Panel>
      <p className="text-muted-foreground">
        Cuidados e foto: dá para preencher depois, na página Família.
      </p>
    </Phone>
  );
}

function Match() {
  return (
    <Phone back="criancas" title="Seus filhos" plain>
      <Heading sub="O nome e a data de nascimento são iguais.">
        Parece que a Ana já está cadastrada por Maria S.
      </Heading>
      <p>
        Se vocês são da mesma família, peça para Maria confirmar. Aí ninguém
        cadastra duas vezes.
      </p>
      <Primary to="pedido-enviado">Pedir para Maria confirmar</Primary>
      <Secondary to="escolher-novos">
        Não é a mesma: continuar assim mesmo
      </Secondary>
    </Phone>
  );
}

function JoinSent() {
  return (
    <Phone back="match" title="Pedido enviado" plain>
      <Heading sub="Qualquer responsável da família pode confirmar.">
        Pedido enviado para Maria
      </Heading>
      <p>
        Enquanto isso, você já pode fazer o check-in. Se ninguém responder, seu
        cadastro continua valendo.
      </p>
      <Primary to="escolher-novos">Fazer o check-in agora</Primary>
    </Phone>
  );
}

function Scan({ state }: { state: 'ok' | 'asking' | 'denied' }) {
  return (
    <Phone back="inicio" title="Escanear o ponto">
      <div className="radius-surface relative grid aspect-square shrink-0 place-items-center bg-black text-center text-white">
        {state === 'ok' ? (
          <div className="radius-surface size-2/3 border-4 border-white/80" />
        ) : null}
        {state === 'asking' ? (
          <p className="p-6">Toque em “Permitir” para usar a câmera.</p>
        ) : null}
        {state === 'denied' ? (
          <p className="p-6">
            A câmera está bloqueada. Libere nos ajustes do navegador ou digite o
            código abaixo.
          </p>
        ) : null}
        {state === 'ok' ? (
          <p className="absolute bottom-3 text-sm">
            Aponte para o QR do ponto Kids
          </p>
        ) : null}
      </div>
      <Field
        label="Ou digite o código do ponto"
        placeholder="Ex.: KIDS-04"
        autoCapitalize="characters"
      />
      <Secondary to="escolher">Continuar com o código</Secondary>
      <p className="text-muted-foreground text-xs">
        A câmera do próprio celular também funciona: é só apontar para o QR.
      </p>
    </Phone>
  );
}

function LinkChurch() {
  return (
    <Phone back="inicio" title="Outra igreja">
      <Heading>Vincular sua família à Igreja Vale?</Heading>
      <p>
        A Igreja Vale poderá ver: os nomes e nascimentos das crianças, os
        responsáveis e os cuidados que você informou.
      </p>
      <Check>Também quero fazer parte da Igreja Vale</Check>
      <Primary to="escolher">Vincular e continuar</Primary>
      <Secondary to="inicio" variant="ghost">
        Agora não
      </Secondary>
    </Phone>
  );
}

function Picker({ preselected = [] }: { preselected?: string[] }) {
  const [picked, setPicked] = useState<string[]>(preselected);
  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const names: Record<string, string> = {
    ana: 'da Ana',
    joao: 'do João',
    leo: 'do Léo',
  };
  const twoFamilies = picked.includes('leo') && picked.length > 1;
  return (
    <Phone
      back="inicio"
      title="Ponto Kids 0-4"
      footer={
        <Primary
          to={
            twoFamilies
              ? 'confirmado-duas'
              : picked.join() === 'ana'
                ? 'confirmado-ana'
                : 'confirmado'
          }
          disabled={!picked.length}
        >
          {picked.length === 0
            ? 'Escolha quem vai entrar'
            : picked.length === 1
              ? `Fazer check-in ${names[picked[0] ?? 'ana']}`
              : `Fazer check-in de ${picked.length} crianças`}
        </Primary>
      }
    >
      <Heading>Quem vai entrar agora?</Heading>
      <h2 className="font-bold">Família Souza</h2>
      <Panel>
        <Check
          checked={picked.includes('ana')}
          onCheckedChange={() => toggle('ana')}
          hint="3 anos"
        >
          <strong>Ana Souza</strong>
        </Check>
        <Check
          checked={picked.includes('joao')}
          onCheckedChange={() => toggle('joao')}
          hint="7 anos · você leva até o ponto Kids 5-13"
        >
          <strong>João Souza</strong>
        </Check>
        <Check disabled hint="Já está no Kids, nº 22">
          <strong>Bia Souza</strong>
        </Check>
        <Check disabled hint="Fale com a liderança do Kids">
          <strong>Davi Souza</strong>
        </Check>
      </Panel>
      <h2 className="font-bold">Família Prado</h2>
      <Panel>
        <Check
          checked={picked.includes('leo')}
          onCheckedChange={() => toggle('leo')}
          hint="4 anos · tem outro código de retirada"
        >
          <strong>Léo Prado</strong>
        </Check>
      </Panel>
    </Phone>
  );
}

function Confirmed({ two, onlyAna }: { two?: boolean; onlyAna?: boolean }) {
  const names = onlyAna ? 'Ana' : 'Ana e João';
  return (
    <Phone footer={<Secondary to="avisos-ligar">Continuar</Secondary>}>
      <CircleCheck
        aria-hidden
        className="size-12 text-green-700 dark:text-green-400"
      />
      <Heading sub={names}>Check-in feito · nº 23</Heading>
      {onlyAna ? null : (
        <Notice tone="warn">
          <p className="font-bold text-base">
            Leve o João até o ponto Kids 5-13
          </p>
          <p>
            Lá, escaneie o QR para terminar a entrada dele. Você tem 15 minutos.
          </p>
        </Notice>
      )}
      <p>
        Entregue a Ana para a equipe aqui no ponto. A etiqueta dela está saindo.
      </p>
      <Primary to="codigo-retirada">Código de retirada de {names}</Primary>
      {two ? (
        <Panel>
          <p className="font-bold">Léo (Família Prado): nº 24, outro código</p>
          <p>Entregue o Léo aqui no ponto.</p>
          <Secondary to="codigo-retirada">Código de retirada do Léo</Secondary>
        </Panel>
      ) : null}
      <p>
        O número aparece no telão se a sala não conseguir te chamar. Para
        retirar, use o código.
      </p>
    </Phone>
  );
}

function PushCoach() {
  // iPhone cannot take notifications before the app is on the Home Screen: steps come first.
  if (/iPhone|iPad/.test(navigator.userAgent)) return <PushIos />;
  return (
    <Phone
      footer={
        <>
          <Primary to="foto-primeira">Ligar notificações</Primary>
          <Secondary to="foto-primeira" variant="ghost">
            Agora não
          </Secondary>
        </>
      }
    >
      <Heading>Deixe a sala te chamar</Heading>
      <p>
        Se uma criança precisar de você, seu celular avisa mesmo com o app
        fechado.
      </p>
      <Panel>
        <p className="font-bold text-muted-foreground text-xs">
          Na tela bloqueada aparece assim:
        </p>
        <Row
          lead={<Initials name="Kids" />}
          title="Kids"
          detail="A Ana precisa de você no Kids"
        />
      </Panel>
      <p className="text-muted-foreground">
        O motivo só aparece dentro do app. No modo silencioso o celular pode não
        tocar.
      </p>
    </Phone>
  );
}

function PushIos() {
  return (
    <Phone
      back="avisos-ligar"
      title="Notificações no iPhone"
      footer={<Secondary to="foto-primeira">Já fiz, continuar</Secondary>}
    >
      <Heading sub="É uma exigência do iPhone. Leva um minuto.">
        Primeiro, coloque o app na tela de início
      </Heading>
      <ol className="space-y-4">
        <li className="flex gap-3">
          <Share className="size-6 shrink-0 text-primary" /> No Safari, toque em
          Compartilhar.
        </li>
        <li className="flex gap-3">
          <SquarePlus className="size-6 shrink-0 text-primary" /> Escolha
          “Adicionar à Tela de Início”.
        </li>
        <li className="flex gap-3">
          <CircleCheck className="size-6 shrink-0 text-primary" /> Abra pelo
          novo ícone e toque em “Ligar notificações”.
        </li>
      </ol>
    </Phone>
  );
}

function Photo({ first }: { first?: boolean }) {
  const go = useGo();
  const done = () => (first ? go('checkin') : window.history.back());
  return (
    <Phone
      footer={
        <>
          <Button className="h-12 text-base" onClick={done}>
            Tirar ou escolher foto
          </Button>
          <Button variant="ghost" onClick={done}>
            Depois
          </Button>
        </>
      }
    >
      <span className="radius-surface mx-auto grid size-40 shrink-0 place-items-center bg-primary/12 text-primary">
        <Camera className="size-14" />
      </span>
      <Heading sub="Na retirada, a equipe confere seu rosto em segundos. Mais rápido e mais seguro, e ajuda a equipe do Kids.">
        Coloque sua foto
      </Heading>
    </Phone>
  );
}

function CreateAccount() {
  return (
    <Phone bare>
      <Heading sub="A conta é sempre criada por uma igreja.">
        Procure sua igreja
      </Heading>
      <Notice tone="warn">
        <p>Você ainda não tem conta com carla@gmail.com.</p>
      </Notice>
      <Field
        label="Nome da igreja ou cidade"
        defaultValue="Semente"
        type="search"
      />
      <Panel>
        <Row
          title="Igreja Semente"
          detail="Campinas, SP"
          action={<Secondary to="cadastro">Escolher</Secondary>}
        />
        <Row
          title="Semente da Fé"
          detail="Recife, PE"
          action={<Secondary to="cadastro">Escolher</Secondary>}
        />
      </Panel>
    </Phone>
  );
}

function SignIn() {
  return (
    <Phone bare>
      <Heading sub="Depois você volta para o ponto Kids 0-4.">Entrar</Heading>
      <Primary to="escolher">Entrar com Google</Primary>
      <p className="text-center text-muted-foreground">ou com e-mail</p>
      <Field label="E-mail" type="email" autoComplete="email" />
      <Field label="Senha" type="password" autoComplete="current-password" />
      <Secondary to="escolher">Entrar</Secondary>
      <Secondary to="criar-conta" variant="ghost">
        Não tenho conta
      </Secondary>
    </Phone>
  );
}

function SecondScan({ done }: { done?: boolean }) {
  if (!done)
    return (
      <Phone back="checkin-a-caminho" title="Ponto Kids 5-13">
        <Heading sub="O mesmo check-in, o mesmo código.">
          Entregar o João aqui?
        </Heading>
        <Primary to="segundo-feito">Confirmar entrada do João</Primary>
      </Phone>
    );
  return (
    <Phone footer={<Primary to="checkin">Pronto</Primary>}>
      <CircleCheck
        aria-hidden
        className="size-12 text-green-700 dark:text-green-400"
      />
      <Heading sub="A etiqueta dele está saindo.">João entrou</Heading>
      <p>O código de retirada continua o mesmo, para ele e para a Ana.</p>
    </Phone>
  );
}

function Failed() {
  return (
    <Phone back="escolher" title="Ponto Kids 0-4">
      <Heading sub="Nada foi registrado.">
        Não deu para fazer o check-in
      </Heading>
      <p>
        Confira a internet do celular e tente de novo. Se continuar, a equipe na
        mesa do Kids faz para você.
      </p>
      <Primary to="escolher">Tentar de novo</Primary>
    </Phone>
  );
}

export const FLOWS: Record<string, React.ReactNode> = {
  'ponto-deslogado': <SignedOutPoint />,
  'criar-conta': <CreateAccount />,
  cadastro: <SignUp />,
  'codigo-email': <EmailCode />,
  perfil: <Profile />,
  criancas: <Children />,
  match: <Match />,
  'pedido-enviado': <JoinSent />,
  escanear: <Scan state="ok" />,
  'escanear-permissao': <Scan state="asking" />,
  'escanear-bloqueada': <Scan state="denied" />,
  vincular: <LinkChurch />,
  entrar: <SignIn />,
  escolher: <Picker />,
  'escolher-novos': <Picker preselected={['ana']} />,
  confirmado: <Confirmed />,
  'confirmado-duas': <Confirmed two />,
  'falha-checkin': <Failed />,
  'escanear-segundo': <SecondScan />,
  'segundo-feito': <SecondScan done />,
  'avisos-ligar': <PushCoach />,
  'avisos-iphone': <PushIos />,
  foto: <Photo />,
  'foto-primeira': <Photo first />,
  'confirmado-ana': <Confirmed onlyAna />,
  'resgatar-cadastro': <SignUp next="resgatar-confirmar" />,
};
