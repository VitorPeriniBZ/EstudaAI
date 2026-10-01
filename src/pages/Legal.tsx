import { Logo } from "@/components/AppHeader";

const CONTATO = "vitorperini.lol@gmail.com";
const ATUALIZADO = "1º de outubro de 2026";

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-3xl items-center px-4">
          <a href="/" aria-label="Início">
            <Logo />
          </a>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Última atualização: {ATUALIZADO}</p>
        <div className="legal mt-8 space-y-6 leading-relaxed [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-8 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:mt-1 [&_a]:underline">
          {children}
        </div>
      </main>
      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        <a href="/privacidade" className="underline">Privacidade</a> ·{" "}
        <a href="/termos" className="underline">Termos de uso</a>
      </footer>
    </div>
  );
}

export function Privacidade() {
  return (
    <Shell title="Política de Privacidade">
      <p>
        Esta política explica quais dados o EstudaAí coleta, como usa e quais são os seus
        direitos, de acordo com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018).
      </p>

      <h2>1. Dados que coletamos</h2>
      <ul>
        <li>
          <strong>Da sua conta Google</strong>, quando você entra: nome, e-mail, foto de perfil e
          um identificador da conta. Não temos acesso à sua senha, Gmail, Drive ou outros dados.
        </li>
        <li>
          <strong>Conteúdo que você envia</strong>: matérias, PDFs, imagens e anotações, e o texto
          extraído deles.
        </li>
        <li>
          <strong>Conteúdo gerado</strong> a partir do seu material: resumos, quizzes, flashcards,
          histórico do chat e resultados dos quizzes.
        </li>
        <li>
          <strong>Cookie de sessão</strong>: um único cookie para manter você conectado. Não usamos
          cookies de publicidade nem rastreadores de terceiros.
        </li>
      </ul>

      <h2>2. Como usamos</h2>
      <p>
        Usamos esses dados só para fazer o serviço funcionar: identificar você, guardar seu
        material e gerar o conteúdo de estudo. Não vendemos nem compartilhamos seus dados para
        publicidade.
      </p>

      <h2>3. Processamento por inteligência artificial</h2>
      <p>
        Para gerar resumos, quizzes, flashcards, respostas do chat e transcrever imagens, o texto
        do seu material é enviado a provedores de IA contratados pelo EstudaAí (por
        exemplo Anthropic ou Google Gemini). Esses provedores processam o conteúdo para devolver a
        resposta, segundo as políticas deles. Evite enviar dados pessoais sensíveis de terceiros
        nos seus materiais.
      </p>

      <h2>4. Onde os dados ficam</h2>
      <p>
        O site é hospedado no Render e o banco de dados no Neon, ambos com servidores nos Estados
        Unidos. Os arquivos que você envia ficam guardados nesse banco de dados.
      </p>

      <h2>5. Por quanto tempo</h2>
      <p>
        Mantemos seus dados enquanto sua conta existir. Ao excluir um material ou uma matéria no
        app, o conteúdo e os arquivos correspondentes são apagados.
      </p>

      <h2>6. Seus direitos</h2>
      <p>
        Você pode pedir acesso, correção ou exclusão dos seus dados e da sua conta a qualquer
        momento pelo e-mail <a href={`mailto:${CONTATO}`}>{CONTATO}</a>. Também pode revogar o
        acesso do EstudaAí à sua conta Google em{" "}
        <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
          myaccount.google.com/permissions
        </a>
        .
      </p>

      <h2>7. Contato</h2>
      <p>
        Dúvidas sobre privacidade: <a href={`mailto:${CONTATO}`}>{CONTATO}</a>.
      </p>
    </Shell>
  );
}

export function Termos() {
  return (
    <Shell title="Termos de Uso">
      <p>Ao usar o EstudaAí, você concorda com estes termos.</p>

      <h2>1. O serviço</h2>
      <p>
        O EstudaAí é uma ferramenta de estudos gratuita: você envia seus materiais e a IA gera
        resumos, quizzes, flashcards e responde dúvidas. O serviço é oferecido “como está”, pode
        mudar, ficar instável ou ser interrompido a qualquer momento.
      </p>

      <h2>2. Sua conta</h2>
      <p>
        O acesso é feito com uma conta Google. Você é responsável pelo que acontece na sua conta.
      </p>

      <h2>3. Seu conteúdo</h2>
      <ul>
        <li>Você continua dono do material que envia.</li>
        <li>
          Envie apenas conteúdo que você tem direito de usar (suas anotações, materiais de aula
          disponibilizados a você etc.).
        </li>
        <li>
          Você nos autoriza a guardar e processar esse conteúdo, inclusive com provedores de IA,
          apenas para gerar o material de estudo para você.
        </li>
      </ul>

      <h2>4. Limitações da IA</h2>
      <p>
        O conteúdo gerado por IA pode conter erros ou omissões. Use como apoio aos estudos e
        confira sempre com o material oficial e com seus professores. Não use o conteúdo como
        orientação médica, jurídica ou profissional.
      </p>

      <h2>5. Uso proibido</h2>
      <p>
        Não é permitido usar o serviço para atividades ilegais, enviar conteúdo ofensivo ou que
        viole direitos de terceiros, nem tentar sobrecarregar ou invadir o sistema. Contas que
        violarem estes termos podem ser suspensas.
      </p>

      <h2>6. Privacidade</h2>
      <p>
        O tratamento dos seus dados está descrito na{" "}
        <a href="/privacidade">Política de Privacidade</a>.
      </p>

      <h2>7. Alterações e contato</h2>
      <p>
        Estes termos podem ser atualizados; a data no topo indica a última versão. Contato:{" "}
        <a href={`mailto:${CONTATO}`}>{CONTATO}</a>. Aplica-se a legislação brasileira.
      </p>
    </Shell>
  );
}
