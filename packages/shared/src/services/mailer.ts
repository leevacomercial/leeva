/**
 * E-mail transacional via Resend (https://resend.com) — REST direto (fetch),
 * sem SDK, pra não repetir o problema do web-push puxando dependência
 * Node-only pro bundle do cliente. Configurar RESEND_API_KEY (e opcionalmente
 * RESEND_FROM_EMAIL) nas env vars do projeto que aprova motoboys (apps/admin).
 * Sem a chave configurada, só loga e segue — nunca bloqueia quem chamou.
 */
const RESEND_API_URL = 'https://api.resend.com/emails';

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!isEmailConfigured()) {
    console.warn(`[mailer] RESEND_API_KEY não configurada — e-mail não enviado (${subject}) para ${to}`);
    return false;
  }
  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL ?? 'Leeva <onboarding@resend.dev>',
        to,
        subject,
        html,
      }),
    });
    if (!res.ok) {
      console.error('[mailer] falha ao enviar e-mail:', res.status, await res.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (e) {
    console.error('[mailer] erro ao enviar e-mail:', e);
    return false;
  }
}

/** Link de redefinição de senha — mandado direto pelo Resend (não usa o
 *  SMTP do Supabase, que exige configuração própria e é mais frágil). */
export async function sendPasswordResetEmail(to: string, link: string): Promise<boolean> {
  return sendEmail(
    to,
    'Redefinir sua senha no Leeva',
    `<p>Recebemos um pedido pra redefinir sua senha.</p>
     <p><a href="${link}">Clique aqui pra criar uma senha nova</a></p>
     <p style="color:#666;font-size:13px">Se você não pediu isso, pode ignorar este e-mail.</p>`,
  );
}

/** Link de confirmação de cadastro — mandado direto pelo Resend (mesma razão do
 *  reset de senha: o SMTP do Supabase é frágil, isso aqui já funciona). */
export async function sendVerificationEmail(to: string, link: string): Promise<boolean> {
  return sendEmail(
    to,
    'Confirme seu e-mail no Leeva',
    `<p>Falta um passo pra ativar sua conta no Leeva.</p>
     <p><a href="${link}">Clique aqui pra confirmar seu e-mail</a></p>
     <p style="color:#666;font-size:13px">Se você não pediu esse cadastro, pode ignorar este e-mail.</p>`,
  );
}

/** Alerta operacional (ex: motor de despacho parado) — manda pro e-mail do operador da plataforma. */
export async function sendOpsAlertEmail(to: string, subject: string, message: string): Promise<boolean> {
  return sendEmail(
    to,
    `[Leeva] ${subject}`,
    `<p>${escapeHtml(message)}</p>
     <p style="color:#666;font-size:13px">Confira em /visao-geral no painel admin.</p>`,
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
