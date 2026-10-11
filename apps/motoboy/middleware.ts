import type { NextRequest } from 'next/server';
import { updateLeevaSession } from '@leeva/shared/middleware';

export async function middleware(request: NextRequest) {
  return updateLeevaSession(request, {
    protectedPaths: ['/status', '/entrega', '/historico', '/desempenho', '/realtime-test'],
    loginPath: '/login',
  });
}

// /api/* fica de fora: cada rota já confere o login sozinha, e passar pelo
// middleware dobrava o custo de toda chamada na Vercel.
export const config = {
  matcher: [
    '/((?!api/|_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
