import { requireRestaurantContext } from '@/lib/context';
import { ConnectMenu } from './ConnectMenu';
import { OpenDeliveryCard } from './OpenDeliveryCard';
import { IfoodLink } from './IfoodLink';
import { IfoodLoja } from './IfoodLoja';

export const dynamic = 'force-dynamic';

export default async function IntegracoesPage() {
  await requireRestaurantContext();
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const deliveriesUrl = `${base}/api/v1/deliveries`;

  return (
    <div className="grid" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>Integrações</h1>
          <div className="sub">De onde chegam seus pedidos de entrega.</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Como um pedido chega no Leeva</div>
        <ul className="muted" style={{ fontSize: 13, lineHeight: 1.9, margin: 0, paddingLeft: 18 }}>
          <li>
            <b>Colando o pedido</b> — Pedidos → Nova entrega → <i>Colar pedido do cardápio</i>. Copie o pedido no{' '}
            <b>Anota AI</b>, Goomer, WhatsApp ou qualquer cardápio e cole: o Leeva preenche nome, telefone, endereço,
            valor e pagamento. Funciona hoje, com qualquer sistema.
          </li>
          <li>
            <b>Automático pelo Open Delivery</b> — Cardápio Web, Saipos e outros que seguem o padrão da Abrasel (abaixo).
          </li>
          <li><b>Automático pela chave de conexão</b> — site próprio ou plataforma que tenha webhook (abaixo).</li>
          <li><b>Do iFood</b> — conector próprio (abaixo), depende da homologação do iFood.</li>
        </ul>
      </div>

      <ConnectMenu deliveriesUrl={deliveriesUrl} />

      <OpenDeliveryCard baseUrl={base} />

      <IfoodLoja />

      <IfoodLink />
    </div>
  );
}
