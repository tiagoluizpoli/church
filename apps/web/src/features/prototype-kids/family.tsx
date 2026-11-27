// PROTOTYPE (wayfinder #1093). Family area, account, invitations, notices (one design each).
import {
  Accessibility,
  Bell,
  Brain,
  HeartPulse,
  Lock,
  Users,
  Wheat,
} from 'lucide-react';
import { useState } from 'react';
import { CheckinCard } from './core';
import {
  CHILDREN,
  Check,
  Field,
  Heading,
  Initials,
  Notice,
  Panel,
  Phone,
  Qr,
  Row,
  useGo,
} from './kit';

const CARE = [
  ['Neurodivergência', Brain],
  ['Alergia ou restrição alimentar', Wheat],
  ['Condição médica', HeartPulse],
  ['Mobilidade ou apoio físico', Accessibility],
] as const;

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

function Go({
  to,
  children,
  variant = 'default',
  disabled,
}: {
  disabled?: boolean;
  to: string;
  children: React.ReactNode;
  variant?: 'default' | 'outline' | 'ghost' | 'destructive';
}) {
  const go = useGo();
  return (
    <Button
      className="shrink-0"
      variant={variant}
      disabled={disabled}
      onClick={() => go(to)}
    >
      {children}
    </Button>
  );
}

const Title = ({ children }: { children: React.ReactNode }) => (
  <h2 className="font-bold text-base">{children}</h2>
);

function Toggle({
  label,
  hint,
  on,
}: {
  label: string;
  hint?: string;
  on?: boolean;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the Switch is the control
    <label className="flex min-h-11 items-center justify-between gap-3">
      <span>
        <span className="block">{label}</span>
        {hint ? (
          <span className="block text-muted-foreground text-xs">{hint}</span>
        ) : null}
      </span>
      <Switch defaultChecked={on} />
    </label>
  );
}

function Family({ noChurch, left }: { noChurch?: boolean; left?: boolean }) {
  return (
    <Phone back="menu" title="Família">
      <Notice>
        <p>Sua foto ajuda a equipe a te reconhecer na retirada.</p>
        <Go to="foto" variant="outline">
          Adicionar foto
        </Go>
      </Notice>
      <h2 className="font-bold text-lg">Família Souza</h2>
      <Title>Crianças</Title>
      <Panel>
        {[CHILDREN.ana, CHILDREN.joao].map((c) => (
          <Row
            key={c.first}
            lead={<Initials name={c.name} />}
            title={c.name}
            detail={`${c.age} · faltam cuidados e foto`}
            action={
              <Go to="crianca" variant="outline">
                Editar
              </Go>
            }
          />
        ))}
        <Go to="crianca-nova" variant="ghost">
          Adicionar criança
        </Go>
      </Panel>
      <Title>Responsáveis</Title>
      <Panel>
        <Row
          lead={<Initials name="Carla Souza" />}
          title="Carla Souza (você)"
        />
        <Row lead={<Initials name="Rafa Souza" />} title="Rafa Souza" />
        <Row
          title="Convite para a avó"
          detail="Expira em 5 dias"
          action={<Button variant="ghost">Cancelar</Button>}
        />
        <Go to="convidar" variant="outline">
          Convidar responsável
        </Go>
      </Panel>
      <Title>Autorizados para retirada</Title>
      <Panel>
        <Row
          title="Joana Lima"
          detail="Até 31/12"
          action={
            <Go to="remover-autorizado" variant="ghost">
              Remover
            </Go>
          }
        />
        <Go to="autorizar" variant="outline">
          Autorizar alguém
        </Go>
      </Panel>
      <Title>Igrejas vinculadas</Title>
      <Panel>
        <Row
          title="Igreja Semente"
          detail="Há um check-in aberto"
          action={
            <Button variant="ghost" disabled>
              Desvincular
            </Button>
          }
        />
        <Go to="vincular" variant="outline">
          Vincular outra igreja
        </Go>
        <Row
          title="Igreja Vale"
          action={<Button variant="ghost">Desvincular</Button>}
        />
      </Panel>
      <Title>Chamadas e mensagens</Title>
      <Panel>
        <Toggle label="Receber chamadas" on />
        <fieldset className="space-y-1">
          <legend className="mb-1">
            Me avisar quando mudar algo (como troca de sala)
          </legend>
          {['Todos os check-ins da família', 'Só os que eu fiz', 'Nenhum'].map(
            (o, i) => (
              <label key={o} className="flex min-h-11 items-center gap-3">
                <input
                  type="radio"
                  name="avisos"
                  defaultChecked={!i}
                  className="size-5 accent-primary"
                />{' '}
                {o}
              </label>
            ),
          )}
        </fieldset>
      </Panel>
      <p className="flex gap-2 text-muted-foreground text-xs">
        <Lock className="size-4 shrink-0" /> Você fez o check-in da Ana; poderá
        sair da família depois da retirada.
      </p>
      <Button variant="destructive" disabled>
        Sair da família
      </Button>
      {left ? null : (
        <>
          <h2 className="font-bold text-lg">Família Prado</h2>
          <Panel>
            <Row
              lead={<Initials name="Léo Prado" />}
              title="Léo Prado"
              detail="4 anos"
              action={
                <Go to="crianca" variant="outline">
                  Editar
                </Go>
              }
            />
            <Go to="sair-familia" variant="ghost">
              Sair desta família
            </Go>
          </Panel>
        </>
      )}
      {noChurch ? (
        <p className="text-muted-foreground">
          Você não está em nenhuma igreja agora. Sua família continua aqui.
        </p>
      ) : null}
    </Phone>
  );
}

function ChildForm({ isNew }: { isNew?: boolean }) {
  const [care, setCare] = useState(false);
  const [stamps, setStamps] = useState(false);
  const [consent, setConsent] = useState(!isNew);
  return (
    <Phone
      back="familia"
      title={isNew ? 'Nova criança' : 'Ana Souza'}
      footer={<Button disabled={!consent}>Salvar</Button>}
    >
      <Field label="Nome completo" defaultValue={isNew ? '' : 'Ana Souza'} />
      <Field
        label="Data de nascimento"
        type="date"
        defaultValue={isNew ? '' : '2023-03-14'}
      />
      {isNew ? (
        <Panel className="border-primary/40">
          <Check
            checked={consent}
            onCheckedChange={(v) => setConsent(v === true)}
            hint="Usados só para o check-in e a segurança no Kids."
          >
            <strong>Autorizo</strong> o uso dos dados desta criança pela
            plataforma e pelas igrejas vinculadas.
          </Check>
        </Panel>
      ) : null}
      <Panel>
        <Row
          lead={<Initials name="Foto" />}
          title="Foto da criança"
          detail="Opcional"
          action={<Button variant="outline">Adicionar</Button>}
        />
        <Check hint="A foto é vista só pela equipe do Kids.">
          Autorizo o uso da foto
        </Check>
      </Panel>
      <Panel>
        <Title>Cuidados</Title>
        <Check
          checked={care}
          onCheckedChange={(v) => setCare(v === true)}
          hint="É informação de saúde. Só a equipe da sala vê."
        >
          Quero informar cuidados e autorizo esse uso
        </Check>
        {care ? (
          <>
            {CARE.map(([label, Icon]) => (
              <Check key={label}>
                <Icon aria-hidden className="mr-2 inline size-4" />
                {label}
              </Check>
            ))}
            <label className="block space-y-1.5">
              <span className="block font-bold">Como cuidar</span>
              <textarea
                className="w-full"
                rows={3}
                placeholder="Ex.: não pode amendoim."
              />
            </label>
            <Check
              checked={stamps}
              onCheckedChange={(v) => setStamps(v === true)}
              hint="A etiqueta é visível para qualquer pessoa."
            >
              Mostrar esses ícones na etiqueta
            </Check>
            {stamps ? (
              <Field
                label="Frase na etiqueta (opcional)"
                maxLength={60}
                placeholder="Chame pelo nome"
              />
            ) : null}
          </>
        ) : null}
      </Panel>
      {isNew ? null : (
        <Go to="historico" variant="outline">
          Histórico da Ana
        </Go>
      )}
    </Phone>
  );
}

function History() {
  return (
    <Phone back="crianca" title="Histórico da Ana">
      {[
        [
          '23/11',
          'Berçário',
          'Entrada: Carla 9:51 · saída: Rafa 11:34',
          '1 chamada: “chorando” (resolvida)',
        ],
        ['16/11', 'Berçário', 'Entrada: Rafa 9:48 · saída: Rafa 11:30', ''],
      ].map(([date, room, who, call]) => (
        <Panel key={date}>
          <Row title={`${date} · ${room}`} detail="Igreja Semente" />
          <p>{who}</p>
          {call ? <p className="text-muted-foreground">{call}</p> : null}
        </Panel>
      ))}
    </Phone>
  );
}

function Invite() {
  return (
    <Phone back="familia" title="Convidar responsável">
      <Heading sub="Quem aceitar poderá fazer check-in e retirar todas as crianças da família.">
        Convide outro responsável
      </Heading>
      <fieldset>
        <legend className="mb-1 font-bold">
          Se a pessoa não tiver conta, ela se cadastra por qual igreja?
        </legend>
        {['Igreja Semente', 'Igreja Vale'].map((c, i) => (
          <label key={c} className="flex min-h-11 items-center gap-3">
            <input
              type="radio"
              name="igreja"
              defaultChecked={!i}
              className="size-5 accent-primary"
            />{' '}
            {c}
          </label>
        ))}
      </fieldset>
      <Go to="convite-enviado">Compartilhar no WhatsApp</Go>
      <Go to="convite-enviado" variant="outline">
        Enviar por e-mail
      </Go>
      <p className="text-muted-foreground">O link vale uma vez, por 7 dias.</p>
    </Phone>
  );
}

function InviteLanding({ state }: { state: 'ok' | 'signedOut' | 'expired' }) {
  if (state === 'expired')
    return (
      <Phone bare>
        <Heading sub="Ele já foi usado, foi cancelado ou passou de 7 dias.">
          Esse convite não vale mais
        </Heading>
        <p>Peça um novo convite para quem te enviou.</p>
        <Go to="inicio" variant="outline">
          Ir para o início
        </Go>
      </Phone>
    );
  return (
    <Phone bare>
      <Users className="size-12 text-primary" />
      <Heading sub="Carla Souza te convidou.">
        Entrar na família de Ana e João?
      </Heading>
      <p>Você poderá fazer check-in e retirar as crianças.</p>
      {state === 'ok' ? (
        <Go to="familia">Entrar na família</Go>
      ) : (
        <>
          <Go to="cadastro">Criar conta pela Igreja Semente</Go>
          <Go to="criar-conta" variant="ghost">
            Não é sua igreja? Procure a sua
          </Go>
        </>
      )}
      <Go to="inicio" variant="ghost">
        Agora não
      </Go>
    </Phone>
  );
}

function JoinRequest() {
  return (
    <Phone back="avisos" title="Pedido para entrar">
      <Heading sub="carla@exemplo.com · cadastrou uma criança com o mesmo nome e nascimento da Ana.">
        Carla Souza quer entrar na sua família
      </Heading>
      <Notice tone="warn">
        <p>
          Aprove só se você conhece essa pessoa. Ela poderá retirar as crianças.
        </p>
      </Notice>
      <Go to="familia">Aprovar</Go>
      <Go to="avisos" variant="outline">
        Recusar
      </Go>
    </Phone>
  );
}

function Authorise() {
  const [period, setPeriod] = useState('hoje');
  return (
    <Phone
      back="checkin"
      title="Autorizar retirada"
      footer={<Go to="autorizado-enviado">Enviar código de retirada</Go>}
    >
      <Heading sub="Para quem não é responsável, como uma tia ou babá.">
        Quem vai retirar?
      </Heading>
      <Field label="Nome completo" defaultValue="Joana Lima" />
      <fieldset>
        <legend className="mb-1 font-bold">Vale até quando?</legend>
        {[
          ['hoje', 'Só este check-in'],
          ['data', 'Até uma data'],
        ].map(([id, label]) => (
          <label key={id} className="flex min-h-11 items-center gap-3">
            <input
              type="radio"
              name="periodo"
              checked={period === id}
              onChange={() => setPeriod(id ?? 'hoje')}
              className="size-5 accent-primary"
            />{' '}
            {label}
          </label>
        ))}
      </fieldset>
      {period === 'data' ? <Field label="Data final" type="date" /> : null}
      <p className="text-muted-foreground">
        Na porta, a equipe vai pedir um documento com foto.
      </p>
    </Phone>
  );
}

function Authorised({ revoked }: { revoked?: boolean }) {
  if (revoked)
    return (
      <Phone bare>
        <Heading sub="Foi cancelado ou o prazo acabou.">
          Este código não vale mais
        </Heading>
        <p>
          Peça um novo para quem te enviou, ou fale com a liderança do Kids.
        </p>
      </Phone>
    );
  return (
    <Phone bare>
      <Heading sub="Enviado por Carla Souza · Igreja Semente · vale até 31/12">
        Retirada de Ana e João
      </Heading>
      <Qr className="mx-auto w-full max-w-72" />
      <p className="text-center font-bold font-mono text-3xl tracking-widest">
        K7Q-4MX
      </p>
      <Notice tone="warn">
        <p className="font-bold">Joana Lima, leve um documento com foto.</p>
        <p>Ana: ponto Kids 0-4 · sala Berçário</p>
        <p>João: ponto Kids 5-13 · sala Exploradores</p>
      </Notice>
    </Phone>
  );
}

function Claim() {
  return (
    <Phone bare>
      <Heading sub="Você foi registrado na mesa do Kids da Igreja Semente.">
        Crie sua conta e fique com o cadastro
      </Heading>
      <p>
        Na próxima vez você faz o check-in pelo celular, e a sala consegue te
        chamar.
      </p>
      <Panel>
        <Row lead={<Initials name="Ana Souza" />} title="Ana Souza" />
      </Panel>
      <Go to="resgatar-cadastro">Criar minha conta</Go>
      <p className="text-muted-foreground text-xs">
        Sem conta, o cadastro é apagado 30 dias depois da última visita.
      </p>
    </Phone>
  );
}

function Account() {
  return (
    <Phone back="menu" title="Minha conta">
      <Row
        lead={<Initials name="Carla Souza" />}
        title="Carla Souza"
        detail="carla@exemplo.com"
        action={
          <Go to="foto" variant="outline">
            Foto
          </Go>
        }
      />
      <Field label="Nome" defaultValue="Carla Souza" />
      <Field label="Celular" type="tel" defaultValue="(19) 91234-5678" />
      <Toggle label="Novidades por WhatsApp ou SMS" />
      <Button>Salvar</Button>
      <Title>Minhas igrejas</Title>
      <Panel>
        <Row
          title="Igreja Semente"
          detail="Membro desde nov/2026"
          action={
            <Go to="sair-igreja" variant="ghost">
              Sair
            </Go>
          }
        />
      </Panel>
      <p className="text-muted-foreground">
        Sair da igreja não apaga sua família nem os vínculos dela.
      </p>
    </Phone>
  );
}

function Inbox() {
  return (
    <Phone back="inicio" title="Notificações">
      <Panel>
        <Row
          lead={<Bell className="size-5 text-primary" />}
          title="A Ana precisa de você no Kids"
          detail="10:38 · resolvida: “voltou a brincar”"
          action={
            <Go to="chamada-resolvida" variant="ghost">
              Ver
            </Go>
          }
        />
        <Row
          lead={<Bell className="size-5 text-primary" />}
          title="Ana foi para a sala Sensorial"
          detail="Venha ao ponto Kids 0-4 na saída"
        />
        <Row
          lead={<Bell className="size-5 text-primary" />}
          title="João saiu do check-in"
          detail="Não foi entregue a tempo"
        />
        <Row
          lead={<Users className="size-5 text-primary" />}
          title="Pedido para entrar na família"
          action={
            <Go to="pedido" variant="outline">
              Responder
            </Go>
          }
        />
      </Panel>
    </Phone>
  );
}

function Menu() {
  return (
    <Phone back="inicio" title="Menu">
      <Go to="inicio" variant="ghost">
        Início
      </Go>
      <Go to="familia" variant="outline">
        Família
      </Go>
      <Go to="conta" variant="ghost">
        Minha conta
      </Go>
      <Go to="escanear" variant="ghost">
        Escanear ponto Kids
      </Go>
    </Phone>
  );
}

function HomeState({
  state,
}: {
  state:
    | 'sem-familia'
    | 'sem-checkin'
    | 'nao-encerrado'
    | 'encerrado'
    | 'resolvida';
}) {
  return (
    <Phone>
      {state === 'sem-familia' ? (
        <Panel>
          <Heading sub="Faça o check-in pelo celular no Kids.">
            Cadastre seus filhos
          </Heading>
          <Go to="crianca-nova">Cadastrar</Go>
        </Panel>
      ) : null}
      {state === 'sem-checkin' ? (
        <Panel>
          <Heading sub="Ao chegar, aponte a câmera para o QR do ponto.">
            Chegou na igreja?
          </Heading>
          <Go to="escanear">Escanear ponto Kids</Go>
        </Panel>
      ) : null}
      {state === 'nao-encerrado' ? (
        <Notice tone="warn">
          <p className="font-bold">Ana e João: check-in não encerrado</p>
          <p>A liderança do Kids vai entrar em contato.</p>
          <Go to="codigo-retirada">Código de retirada</Go>
        </Notice>
      ) : null}
      {state === 'encerrado' ? (
        <>
          <Notice>
            <p className="font-bold">
              Ana e João foram entregues a Rafa Souza às 11:34
            </p>
            <p>Check-in encerrado em todos os celulares da família.</p>
          </Notice>
          <Panel>
            <p>Vai voltar para o Kids hoje?</p>
            <Go to="escanear">Escanear ponto Kids</Go>
          </Panel>
        </>
      ) : null}
      {state === 'resolvida' ? (
        <>
          <Notice>
            <p className="font-bold">Chamada da Ana resolvida às 10:45</p>
            <p>“Voltou a brincar.”</p>
          </Notice>
          <CheckinCard />
        </>
      ) : null}
    </Phone>
  );
}

function LeaveFamily() {
  return (
    <Phone back="familia" title="Sair da família">
      <Heading sub="Vale na hora.">Sair da Família Prado?</Heading>
      <p>
        Você sai da lista de retirada, o código salvo neste celular é apagado e
        você para de receber chamadas do Léo.
      </p>
      <Go to="familia-sem-prado" variant="destructive">
        Sair da família
      </Go>
      <Go to="familia" variant="ghost">
        Ficar
      </Go>
    </Phone>
  );
}

function ClaimConsent() {
  const [consent, setConsent] = useState(false);
  return (
    <Phone
      bare
      footer={
        <Go to="inicio-sem-checkin" disabled={!consent}>
          Concluir
        </Go>
      }
    >
      <Heading sub="Registrada na mesa do Kids. Confira e autorize.">
        Sua criança já está aqui
      </Heading>
      <Panel>
        <Row
          lead={<Initials name="Ana Souza" />}
          title="Ana Souza"
          detail="14/03/2023"
        />
      </Panel>
      <Check
        checked={consent}
        onCheckedChange={(v) => setConsent(v === true)}
        hint="Usados só para o check-in e a segurança no Kids."
      >
        <strong>Autorizo</strong> o uso dos dados desta criança pela plataforma
        e pelas igrejas vinculadas.
      </Check>
    </Phone>
  );
}

function Sent({
  title,
  detail,
  preview,
  back,
}: {
  title: string;
  detail: string;
  preview: string;
  back: string;
}) {
  return (
    <Phone back={back} title="Enviado">
      <Heading sub={detail}>{title}</Heading>
      <Go to={back}>Voltar</Go>
      <Go to={preview} variant="ghost">
        (protótipo) ver como a pessoa recebe
      </Go>
    </Phone>
  );
}

function Confirm({
  title,
  detail,
  action,
  back,
}: {
  title: string;
  detail: string;
  action: string;
  back: string;
}) {
  return (
    <Phone back={back} title="Confirmar">
      <Heading sub={detail}>{title}</Heading>
      <Go to={back} variant="destructive">
        {action}
      </Go>
      <Go to={back} variant="ghost">
        Cancelar
      </Go>
    </Phone>
  );
}

export const FAMILY: Record<string, React.ReactNode> = {
  menu: <Menu />,
  avisos: <Inbox />,
  familia: <Family />,
  'familia-sem-prado': <Family left />,
  'convite-enviado': (
    <Sent
      title="Convite enviado"
      detail="Vale uma vez, por 7 dias. Você pode cancelar na página Família."
      preview="convite-recebido"
      back="familia"
    />
  ),
  'autorizado-enviado': (
    <Sent
      title="Código enviado para Joana"
      detail="Ela mostra o código e um documento com foto na hora de buscar."
      preview="autorizado"
      back="checkin"
    />
  ),
  'sair-igreja': (
    <Confirm
      title="Sair da Igreja Semente?"
      detail="Sua família e os vínculos dela continuam."
      action="Sair da igreja"
      back="conta"
    />
  ),
  'remover-autorizado': (
    <Confirm
      title="Remover Joana Lima?"
      detail="O código enviado para ela deixa de valer."
      action="Remover"
      back="familia"
    />
  ),
  'familia-sem-igreja': <Family noChurch />,
  'crianca-nova': <ChildForm isNew />,
  'sair-familia': <LeaveFamily />,
  'resgatar-confirmar': <ClaimConsent />,
  'autorizado-cancelado': <Authorised revoked />,
  crianca: <ChildForm />,
  historico: <History />,
  convidar: <Invite />,
  'convite-recebido': <InviteLanding state="ok" />,
  'convite-sem-conta': <InviteLanding state="signedOut" />,
  'convite-vencido': <InviteLanding state="expired" />,
  pedido: <JoinRequest />,
  autorizar: <Authorise />,
  autorizado: <Authorised />,
  resgatar: <Claim />,
  conta: <Account />,
  'inicio-sem-familia': <HomeState state="sem-familia" />,
  'inicio-sem-checkin': <HomeState state="sem-checkin" />,
  'checkin-nao-encerrado': <HomeState state="nao-encerrado" />,
  'checkin-encerrado': <HomeState state="encerrado" />,
  'chamada-resolvida': <HomeState state="resolvida" />,
};
