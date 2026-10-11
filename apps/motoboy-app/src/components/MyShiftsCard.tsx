import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { getMyShifts, type MyShift } from '../api/motoboy';
import { useTheme } from '../theme/ThemeContext';
import type { Theme } from '../theme/theme';
import { Card } from './Card';

const TZ = 'America/Sao_Paulo';
const day = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: TZ });
const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TZ });

/** "Minha escala": próximos turnos. Some quando o estabelecimento não usa escala. */
export function MyShiftsCard(): React.JSX.Element | null {
  const styles = makeStyles(useTheme());
  const [shifts, setShifts] = useState<MyShift[]>([]);

  // recarrega quando a Home ganha foco — sem polling
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      getMyShifts()
        .then((s) => alive && setShifts(s))
        .catch(() => {});
      return () => {
        alive = false;
      };
    }, []),
  );

  if (!shifts.length) return null;
  return (
    <Card>
      <Text style={styles.title}>Minha escala</Text>
      {shifts.slice(0, 7).map((s) => (
        <View key={s.id} style={styles.row}>
          <Text style={styles.day}>{day(s.starts_at)}</Text>
          <Text style={[styles.time, s.active && styles.live]}>
            {time(s.starts_at)} – {time(s.ends_at)}
            {s.active ? '  · agora' : ''}
          </Text>
        </View>
      ))}
    </Card>
  );
}

function makeStyles(t: Theme) {
  return StyleSheet.create({
    title: { fontFamily: t.fonts.bodySemiBold, fontSize: 15, color: t.colors.text, marginBottom: t.spacing.sm },
    row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
    day: { fontFamily: t.fonts.body, fontSize: 14, color: t.colors.textSecondary, textTransform: 'capitalize' },
    time: { fontFamily: t.fonts.bodyMedium, fontSize: 14, color: t.colors.text, fontVariant: ['tabular-nums'] },
    live: { color: t.colors.success },
  });
}
