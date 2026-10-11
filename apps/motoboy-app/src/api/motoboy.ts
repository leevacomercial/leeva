import { apiGet, apiSend } from './client';
import { supabase } from '../lib/supabase';
import type { MotoboyMe, Performance } from '../types';

export function getMe(): Promise<MotoboyMe> {
  return apiGet<MotoboyMe>('/api/me');
}

export async function setOnline(online: boolean): Promise<{ status: string }> {
  return apiSend<{ ok: boolean; status: string }>('/api/status', 'POST', { online });
}

/** Grava a posição direto no Supabase (sem passar pela Vercel). Só grava com entrega ativa. */
export async function sendLocation(latitude: number, longitude: number): Promise<void> {
  const { error } = await supabase.rpc('record_my_location', { p_latitude: latitude, p_longitude: longitude });
  if (error) throw new Error(error.message);
}

export function getPerformance(): Promise<Performance> {
  return apiGet<Performance>('/api/performance');
}

export function acceptTerms(version: number): Promise<{ ok: boolean }> {
  return apiSend<{ ok: boolean }>('/api/terms', 'POST', { version });
}

/** Registra o token de push do Expo no backend. */
export function registerExpoPush(token: string): Promise<{ ok: boolean }> {
  return apiSend<{ ok: boolean }>('/api/push/expo', 'POST', { token });
}


export type MyShift = { id: string; starts_at: string; ends_at: string; note: string | null; active: boolean };

/** Próximos turnos da escala montada pelo estabelecimento (14 dias). */
export async function getMyShifts(): Promise<MyShift[]> {
  const r = await apiGet<{ shifts: MyShift[] }>('/api/shifts');
  return r.shifts;
}
