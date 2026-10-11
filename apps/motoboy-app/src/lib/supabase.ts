/**
 * Cliente Supabase do app nativo. Auth persistida no AsyncStorage.
 *
 * Config vem das vars EXPO_PUBLIC_* (expostas automaticamente pelo Expo em
 * process.env). Ver .env.example.
 */
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** Base das rotas /api do painel do motoboy (Next.js), ex.: https://leeva-motoboy-snowy.vercel.app */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://leeva-motoboy-snowy.vercel.app').replace(/\/$/, '');

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // não derruba o app — as telas de login vão mostrar o erro de config
  console.warn('[leeva] EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY não configurados');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}
