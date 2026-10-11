'use client';

import { useEffect } from 'react';
import styles from './landing.module.css';

/** classe do CSS module (sempre string) */
const c = (k: string): string => styles[k] ?? '';

/** [classe, texto, espera em ms antes do próximo] — a entrega do celular da demo. */
const ROTEIRO: [('sis' | 'evt' | 'ok' | 'wait'), string, number][] = [
  ['sis', 'Nova entrega · Maria S. · 2,8 km', 1100],
  ['wait', 'Chamando o motoboy livre mais perto…', 1900],
  ['evt', 'João aceitou · está a 1,2 km da loja', 1700],
  ['evt', 'João chegou na loja', 1500],
  ['evt', 'Pedido coletado · link de rastreio enviado à cliente', 1800],
  ['evt', 'A caminho · chega em 6 min', 2000],
  ['ok', 'Entregue · código 4821 conferido ✓', 3600],
];

const HORA = ['19:02', '19:02', '19:03', '19:09', '19:10', '19:11', '19:18'];

/**
 * Animações da landing que precisam de JS: seções aparecendo ao rolar, a
 * linha dos passos se desenhando e a entrega que se escreve sozinha no
 * celular. Sem JS (ou com "reduzir movimento"), tudo aparece estático.
 */
export default function LandingFx() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-landing]');
    if (!root) return;
    const calmo = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cleanups: (() => void)[] = [];

    // --- aparecer ao rolar: o que já está na tela no carregamento fica visível
    const revelas = [...root.querySelectorAll<HTMLElement>('[data-revela]')];
    if ('IntersectionObserver' in window && !calmo) {
      const abaixo = revelas.filter((el) => el.getBoundingClientRect().top > window.innerHeight);
      root.classList.add(c('jsAnima'));
      revelas.forEach((el) => {
        if (!abaixo.includes(el)) el.classList.add(c('visto'));
      });
      const obs = new IntersectionObserver(
        (entradas) =>
          entradas.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add(c('visto'));
              obs.unobserve(e.target);
            }
          }),
        { rootMargin: '0px 0px -8% 0px' },
      );
      abaixo.forEach((el, i) => {
        el.style.transitionDelay = `${(i % 3) * 90}ms`;
        obs.observe(el);
      });
      cleanups.push(() => obs.disconnect());
    } else {
      revelas.forEach((el) => el.classList.add(c('visto')));
    }

    // --- a entrega no celular
    const caixa = root.querySelector<HTMLElement>('[data-demo]');
    const status = root.querySelector<HTMLElement>('[data-demo-status]');
    if (caixa) {
      const linha = (tipo: string, texto: string, hora: string) => {
        const el = document.createElement('div');
        el.className = `${c('evento')} ${c(tipo)}`;
        const p = document.createElement('p');
        p.textContent = texto;
        el.appendChild(p);
        if (tipo !== 'sis') {
          const t = document.createElement('time');
          t.textContent = hora;
          el.appendChild(t);
        }
        return el;
      };

      if (calmo) {
        ROTEIRO.forEach(([tipo, texto], i) => caixa.appendChild(linha(tipo === 'wait' ? 'evt' : tipo, texto, HORA[i]!)));
        if (status) status.textContent = 'entrega concluída';
      } else {
        let i = 0;
        let timer: ReturnType<typeof setTimeout>;
        let visivel = false;
        const passo = () => {
          if (!visivel) return;
          if (i >= ROTEIRO.length) {
            i = 0;
            caixa.replaceChildren();
            if (status) status.textContent = '1 entrega em andamento';
            timer = setTimeout(passo, 700);
            return;
          }
          const [tipo, texto, espera] = ROTEIRO[i]!;
          caixa.querySelector(`.${c('digitando')}`)?.remove();
          if (tipo === 'wait') {
            const d = document.createElement('div');
            d.className = c('digitando');
            d.innerHTML = `<span>${texto}</span><i></i><i></i><i></i>`;
            caixa.appendChild(d);
          } else {
            caixa.appendChild(linha(tipo, texto, HORA[i]!));
            if (tipo === 'ok' && status) status.textContent = 'entrega concluída';
          }
          i += 1;
          timer = setTimeout(passo, espera);
        };
        // só roda quando o celular está na tela (economiza bateria no celular)
        const io = new IntersectionObserver(([e]) => {
          const agora = !!e?.isIntersecting;
          if (agora && !visivel) {
            visivel = true;
            passo();
          } else if (!agora) {
            visivel = false;
            clearTimeout(timer);
          }
        });
        io.observe(caixa);
        cleanups.push(() => {
          io.disconnect();
          clearTimeout(timer);
        });
      }
    }

    return () => cleanups.forEach((f) => f());
  }, []);

  return null;
}
