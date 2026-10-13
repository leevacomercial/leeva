import type { ReactNode } from 'react';
import Link from 'next/link';
import styles from './landing.module.css';
import LandingFx from './LandingFx';
import { body, display, mono } from './fonts';

/**
 * Página pública de venda do Leeva para comércios (raiz para visitantes e
 * /lojistas). Segue o modelo visual da landing da Farol, a pedido da dona.
 * Só promete o que o produto já faz hoje.
 *
 * Modelo: o comércio usa os PRÓPRIOS motoboys e paga só a mensalidade.
 * Valores: plano "mensal" (migration 0049, editável no admin › Planos) e
 * teste grátis. Se mudar lá, mude aqui.
 */

const MENSALIDADE = 149;
const DIAS_TESTE = 14;

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const FRASES: { t: ReactNode; s: string }[] = [
  { t: <>Pedido entrou? <em>Vai pro primeiro da fila.</em></>, s: 'Quem ficou livre primeiro recebe a próxima entrega, direto no app. Sem discussão no balcão.' },
  { t: <>Sua equipe <em>no mapa, ao vivo</em>.</>, s: 'Veja quem está livre, quem está em rota e onde cada um está agora.' },
  { t: <>Escala da semana <em>em dois cliques</em>.</>, s: 'Monte os turnos e o Leeva só chama quem está trabalhando.' },
  { t: <>Cliente acompanha <em>sem baixar nada</em>.</>, s: 'Mande o link de rastreio pelo WhatsApp e ele vê o motoboy chegando.' },
  { t: <>Entrega confirmada com <em>código</em>.</>, s: 'O cliente passa 4 dígitos ao motoboy. Pedido do iFood fecha com o localizador.' },
  { t: <>Acerto do motoboy <em>pronto</em>.</>, s: 'Quanto pagar a cada um no fim do dia, já descontado o dinheiro que ele recebeu.' },
  { t: <>Taxa por bairro, <em>sem conta de cabeça</em>.</>, s: 'Cada bairro com o que o cliente paga e o que o motoboy recebe. O resto vai por km.' },
];

const PASSOS = [
  { t: 'O pedido entra', d: 'Do WhatsApp, do seu cardápio, do iFood ou digitado no painel. Confira o ponto no mapa.', ic: 'M4 7h16M4 12h10M4 17h7M17 15l2 2 4-4' },
  { t: 'O motoboy certo é chamado', d: 'Vai sozinho pro app de quem está livre há mais tempo (a fila). Quer outro? Troque com um toque no mapa.', ic: 'M12 3a6 6 0 0 1 6 6c0 4.5-6 12-6 12S6 13.5 6 9a6 6 0 0 1 6-6Zm0 4.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z' },
  { t: 'Todo mundo acompanha', d: 'Você vê a equipe inteira no mapa ao vivo. O cliente acompanha pelo link.', ic: 'M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Zm9-2.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z' },
  { t: 'Entregue com código', d: 'O cliente passa 4 dígitos, o motoboy confirma e o pedido fecha sozinho.', ic: 'M5 12.5 9.2 16.7 19 7' },
];

const RECURSOS: { t: string; d: string; meta: string; dif?: boolean }[] = [
  { t: 'Fila de motoboys', d: 'Ninguém precisa ficar escolhendo motoboy: quem ficou livre primeiro recebe a próxima entrega. Quer decidir? Mande ou troque direto pelo mapa.', meta: 'chama em segundos', dif: true },
  { t: 'Mapa ao vivo da equipe', d: 'Todos os seus motoboys no mapa, com nome: quem está livre, quem está levando o quê e quem sumiu do GPS.', meta: 'tempo real', dif: true },
  { t: 'Escalas e turnos', d: 'Monte a semana, repita na seguinte com um clique e ligue a trava pra só chamar quem está de turno.', meta: 'escala semanal', dif: true },
  { t: 'Rotas agrupadas', d: 'Entregas no mesmo caminho saem juntas, na ordem que roda menos e respeita o prazo de cada cliente.', meta: 'roteirização' },
  { t: 'Rastreio para o cliente', d: 'Link de acompanhamento sem precisar baixar nada. Menos cliente ligando pra perguntar do pedido.', meta: 'link no WhatsApp' },
  { t: 'Taxa por bairro', d: 'Cadastre seus bairros com o valor do cliente e o do motoboy na mesma linha. Bairro fora da lista vai pela regra por km.', meta: 'cliente · motoboy', dif: true },
  { t: 'Acerto dos motoboys', d: 'O Leeva soma as entregas de cada um pela sua tabela e desconta o dinheiro que ele recebeu do cliente.', meta: 'por motoboy' },
  { t: 'Relatórios com filtro', d: 'Filtre por data, motoboy, forma de pagamento e bairro. Veja totais, tempo médio e baixe a planilha.', meta: 'planilha' },
  { t: 'Convite pelo WhatsApp', d: 'Cadastre o motoboy com nome e telefone e mande o convite: link do app e código pra ativar. Ele só vê as entregas da sua loja.', meta: 'convite com código' },
  { t: 'Chat com o motoboy', d: 'Fale com quem está levando o pedido direto do painel, ou chame no WhatsApp dele.', meta: 'chat · WhatsApp' },
  { t: 'Pedidos do iFood e cardápios', d: 'Use sua equipe nos pedidos do iFood (entrega própria) e cole pedidos de qualquer cardápio digital.', meta: 'iFood · Anota AI' },
];

const FAQ = [
  { q: 'Quanto custa?', a: `Uma mensalidade de ${brl(MENSALIDADE)}, com ${DIAS_TESTE} dias grátis pra testar. Não tem taxa por entrega nem porcentagem sobre a sua venda.` },
  { q: 'Preciso ter motoboy?', a: 'Sim. O Leeva organiza a SUA equipe: você cadastra seus motoboys, eles baixam o app e as entregas chegam pra eles. Você paga eles direto, do jeito que já paga hoje.' },
  { q: 'E o pagamento dos motoboys?', a: 'Continua com você. O Leeva calcula quanto cada um fez no dia pela tabela que você definir e já desconta o dinheiro que ele recebeu de cliente.' },
  { q: 'Como o motoboy entra no app?', a: 'Você cadastra ele com nome e telefone e toca em "Mandar convite". Chega no WhatsApp dele o link do app e um código; ele cria e-mail e senha e pronto. A conta dele fica ligada só à sua loja.' },
  { q: 'Como funciona a fila?', a: 'Quem ficou disponível (ou terminou a última entrega) primeiro recebe o próximo pedido. Entregas perto uma da outra podem sair juntas com o mesmo motoboy. Você pode trocar o motoboy de qualquer pedido pelo mapa.' },
  { q: 'Como fica a taxa de entrega?', a: 'Você monta a tabela por bairro: quanto o cliente paga e quanto o motoboy recebe em cada um. Bairro que não estiver na lista usa a regra por km que você definir.' },
  { q: 'Preciso instalar alguma coisa?', a: 'Não. O painel funciona no navegador do computador ou do celular. Quem usa aplicativo é o motoboy.' },
  { q: 'Tem fidelidade?', a: 'Não. Você pode cancelar quando quiser.' },
];

function Check() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" d="m5 12.5 4.2 4.2L19 7" />
    </svg>
  );
}

function Mark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.5a7 7 0 0 0-7 7c0 5.2 7 12 7 12s7-6.8 7-12a7 7 0 0 0-7-7z" fill="currentColor" />
      <circle cx="12" cy="9.5" r="2.6" fill="var(--ground)" />
    </svg>
  );
}

/** Painel de exemplo do hero: a moto percorre a rota da loja até o cliente. */
function Painel() {
  const rota = 'M40 150 C 90 150, 95 95, 150 92 S 215 60, 238 58 S 300 34, 318 28';
  return (
    <div className={styles.painel} role="img" aria-label="Exemplo do painel do Leeva: motoboy da equipe a caminho do cliente, com rota, tempo, distância e código de entrega">
      <div className={styles.painelTop}>
        <b>Pedido #128 · Maria S.</b>
        <span className={`${styles.chip} ${styles.vivo}`}>ao vivo</span>
      </div>
      <svg className={styles.mapa} viewBox="0 0 360 180" aria-hidden="true">
        <g className={styles.ruas}>
          <path d="M0 40H360M0 100H360M0 160H360M60 0V180M150 0V180M250 0V180M320 0V180" />
          <path d="M0 130 L120 10M180 180 L360 60" />
        </g>
        <path d={rota} className={styles.rotaFundo} />
        <path d={rota} className={styles.rotaFeita} pathLength={100} />
        <g className={styles.loja}>
          <circle cx="40" cy="150" r="16" className={styles.radar} />
          <circle cx="40" cy="150" r="7" />
        </g>
        <g className={styles.cliente}>
          <circle cx="318" cy="28" r="8" />
        </g>
        <g className={styles.moto}>
          <circle r="10" />
          <path d="M-4 1h5l1.6-3.4M-3.5-2.5h2.5" />
          <animateMotion dur="7s" repeatCount="indefinite" path={rota} keyTimes="0;0.85;1" keyPoints="0;1;1" calcMode="linear" />
        </g>
      </svg>
      <div className={styles.kpis}>
        <div className={styles.kpi}>
          <small>Motoboy</small>
          <strong>João</strong>
          <span className={styles.d}>CG 160 · ★ 4,9</span>
        </div>
        <div className={styles.kpi}>
          <small>Chega em</small>
          <strong>6 min</strong>
          <span className={styles.d}>2,8 km</span>
        </div>
        <div className={styles.kpi}>
          <small>Na rota</small>
          <strong>2 entregas</strong>
          <span className={styles.d}>saíram juntas</span>
        </div>
      </div>
      <div className={styles.codigo}>
        <span>Código de entrega</span>
        <strong>4 8 2 1</strong>
      </div>
      <p className={styles.legenda}>Exemplo do painel que o restaurante acompanha</p>
    </div>
  );
}

export default function Landing() {
  return (
    <div className={`${styles.page} ${display.variable} ${body.variable} ${mono.variable}`} data-landing>
      <header className={styles.top}>
        <div className={styles.wrap}>
          <Link href="/" className={styles.logo} aria-label="Leeva, início">
            <Mark />
            leeva
          </Link>
          <nav className={styles.nav} aria-label="Seções">
            <a href="#como-funciona">Como funciona</a>
            <a href="#demo">Na prática</a>
            <a href="#precos">Preços</a>
            <a href="#duvidas">Dúvidas</a>
          </nav>
          <div className={styles.topCta}>
            <Link href="/login" className={styles.entrar}>
              Entrar
            </Link>
            <Link href="/signup" className={`${styles.btn} ${styles.btnVerde}`}>
              Criar conta
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className={styles.hero}>
          <svg className={styles.trilhas} viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            <path d="M-50 560 C 200 520, 260 380, 470 360 S 760 300, 900 180 S 1150 90, 1260 60" />
            <path d="M-50 300 C 180 330, 330 220, 520 250 S 820 420, 1260 380" />
            <path d="M200 760 C 260 560, 420 520, 600 560 S 900 700, 1000 760" />
          </svg>
          <div className={`${styles.wrap} ${styles.heroGrid}`}>
            <div>
              <p className={styles.eyebrow}>Para lojas com motoboy próprio · João Pessoa</p>
              <h1 className={styles.h1}>
                Sua equipe de motoboys, <em>organizada sozinha.</em>
              </h1>
              <p className={styles.lead}>
                Cada pedido vai sozinho pro primeiro da fila, você vê a equipe inteira no mapa ao vivo, as rotas se montam e o
                acerto de cada motoboy sai pronto. Mensalidade fixa, sem taxa por entrega.
              </p>
              <div className={styles.ctas}>
                <Link href="/signup" className={`${styles.btn} ${styles.btnVerde} ${styles.pulsa}`}>
                  Criar conta grátis
                </Link>
                <a href="#precos" className={`${styles.btn} ${styles.btnGhost}`}>
                  Ver preço
                </a>
              </div>
              <p className={styles.ctasNote}>
                {DIAS_TESTE} dias grátis, sem cartão de crédito. Cadastro em poucos minutos.
              </p>
            </div>
            <Painel />
          </div>
        </section>

        <div className={styles.faixa} aria-label="Por que o Leeva">
          <div className={styles.trilho}>
            {[0, 1].map((k) => (
              <ul key={k} aria-hidden={k === 1 ? true : undefined}>
                {FRASES.map((f, i) => (
                  <li key={i}>
                    <strong>{f.t}</strong>
                    <span>{f.s}</span>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>

        <section className={styles.sec}>
          <div className={styles.wrap}>
            <div className={`${styles.secHead} ${styles.revela}`} data-revela>
              <p className={styles.eyebrow}>Se você se reconhece aqui</p>
              <h2 className={styles.h2}>O problema não é a sua cozinha. É a entrega.</h2>
            </div>
            <div className={styles.dores}>
              <div className={`${styles.dor} ${styles.revela}`} data-revela>
                <span className={styles.q} aria-hidden="true">“</span>
                <h3 className={styles.h3}>Ninguém sabe quem leva o quê.</h3>
                <p>Pedido gritado no balcão, motoboy perguntando no WhatsApp. No Leeva cada entrega já vai pro app de quem está livre.</p>
              </div>
              <div className={`${styles.dor} ${styles.revela}`} data-revela>
                <span className={styles.q} aria-hidden="true">“</span>
                <h3 className={styles.h3}>No fim da noite, a conta não fecha.</h3>
                <p>Quantas entregas cada um fez? Quanto de dinheiro ficou com ele? O Leeva mostra o acerto pronto, motoboy por motoboy.</p>
              </div>
              <div className={`${styles.dor} ${styles.revela}`} data-revela>
                <span className={styles.q} aria-hidden="true">“</span>
                <h3 className={styles.h3}>O cliente liga cinco vezes: “cadê meu pedido?”</h3>
                <p>Mande o link de rastreio e ele acompanha o motoboy chegando. Sua equipe volta a cuidar da cozinha.</p>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.sec} id="como-funciona">
          <div className={styles.wrap}>
            <div className={`${styles.secHead} ${styles.centro} ${styles.revela}`} data-revela>
              <p className={styles.eyebrow}>Como funciona</p>
              <h2 className={styles.h2}>Do pedido à porta do cliente, sem você ligar pra ninguém.</h2>
            </div>
            <ol className={`${styles.passos} ${styles.revela}`} data-revela data-linha>
              {PASSOS.map((p) => (
                <li key={p.t} className={styles.passo}>
                  <span className={styles.ic}>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d={p.ic} />
                    </svg>
                  </span>
                  <h3 className={styles.h3}>{p.t}</h3>
                  <p>{p.d}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className={`${styles.sec} ${styles.demo}`} id="demo">
          <div className={`${styles.wrap} ${styles.demoGrid}`}>
            <div>
              <div className={`${styles.secHead} ${styles.revela}`} data-revela style={{ marginBottom: 0 }}>
                <p className={styles.eyebrow}>Na prática</p>
                <h2 className={styles.h2}>Uma entrega inteira em menos de meia hora. Você só criou o pedido.</h2>
                <p className={styles.lead}>É assim que o pedido anda no seu painel, do momento em que você confirma até o código ser conferido.</p>
              </div>
              <ul className={styles.pontos}>
                <li><Check /><span><b>Nada de gritar no balcão</b> ou mandar áudio pra saber quem pega.</span></li>
                <li><Check /><span><b>Tudo registrado:</b> quem levou, que horas saiu, que horas chegou.</span></li>
                <li><Check /><span><b>Confirmação por código</b>, pra entrega não ser dada como feita sem ter chegado.</span></li>
              </ul>
            </div>
            <div className={styles.celular} role="img" aria-label="Demonstração: uma entrega andando no painel do Leeva, da criação até a confirmação com código">
              <div className={styles.tela}>
                <div className={styles.entalhe} aria-hidden="true" />
                <div className={styles.appTopo}>
                  <span className={styles.av}><Mark /></span>
                  <div>
                    <b>Doceria da Maria</b>
                    <small data-demo-status>1 entrega em andamento</small>
                  </div>
                </div>
                <div className={styles.eventos} data-demo aria-hidden="true" />
              </div>
            </div>
          </div>
        </section>

        <section className={`${styles.sec} ${styles.recursos}`}>
          <div className={`${styles.wrap} ${styles.recursosGrid}`}>
            <div className={`${styles.secHead} ${styles.fixo} ${styles.revela}`} data-revela>
              <p className={styles.eyebrow}>O que vem junto</p>
              <h2 className={styles.h2}>Não é só um app de motoboy. É a sua entrega inteira organizada.</h2>
              <p className={styles.lead}>Os itens em destaque são o que mais muda o dia a dia de quem tem equipe própria.</p>
              <Link href="/signup" className={`${styles.btn} ${styles.btnVerde}`}>
                Quero isso na minha loja
              </Link>
            </div>
            <ul className={styles.lista}>
              {RECURSOS.map((r) => (
                <li key={r.t} className={`${styles.item} ${r.dif ? styles.dif : ''} ${styles.revela}`} data-revela>
                  <div>
                    {r.dif && <span className={styles.rot}>Diferencial</span>}
                    <h3 className={styles.itemTitulo}>{r.t}</h3>
                    <p>{r.d}</p>
                  </div>
                  <span className={styles.meta}>
                    {r.dif && <i />}
                    {r.meta}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className={styles.sec} id="precos">
          <div className={styles.wrap}>
            <div className={`${styles.secHead} ${styles.revela}`} data-revela>
              <p className={styles.eyebrow}>Preço</p>
              <h2 className={styles.h2}>{brl(MENSALIDADE)} por mês. Tudo incluso.</h2>
              <p className={styles.lead}>
                Uma mensalidade fixa, com {DIAS_TESTE} dias grátis pra testar. Sem taxa por entrega, sem porcentagem sobre a sua venda e
                sem fidelidade. Motoboys, pedidos e entregas ilimitados.
              </p>
              <Link href="/signup" className={`${styles.btn} ${styles.btnVerde}`}>
                Começar o teste grátis
              </Link>
            </div>
          </div>
        </section>

        <section className={styles.sec} id="duvidas">
          <div className={styles.wrap}>
            <div className={`${styles.secHead} ${styles.revela}`} data-revela>
              <p className={styles.eyebrow}>Dúvidas comuns</p>
              <h2 className={styles.h2}>Antes de você perguntar</h2>
            </div>
            <div className={styles.faq}>
              {FAQ.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className={`${styles.sec} ${styles.final}`}>
          <div className={styles.wrap}>
            <h2 className={styles.h2}>Faça sua primeira entrega hoje.</h2>
            <p className={styles.lead}>Crie a conta, cadastre sua equipe e mande o primeiro pedido. Os primeiros {DIAS_TESTE} dias são por nossa conta.</p>
            <Link href="/signup" className={`${styles.btn} ${styles.btnVerde} ${styles.pulsa}`}>
              Criar conta grátis
            </Link>
          </div>
        </section>
      </main>

      <footer className={styles.rodape}>
        <div className={styles.wrap}>
          <span>© 2026 Leeva · Organização de entregas com motoboy próprio</span>
          <span className={styles.rodapeLinks}>
            <Link href="/login">Entrar</Link>
            <span>João Pessoa, PB</span>
          </span>
        </div>
      </footer>

      <LandingFx />
    </div>
  );
}
