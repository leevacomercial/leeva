import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { type NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Bike } from 'lucide-react-native';
import React, { useCallback } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '../../components/Avatar';
import { Card } from '../../components/Card';
import { LiveMapMini } from '../../components/LiveMapMini';
import { MyShiftsCard } from '../../components/MyShiftsCard';
import { SearchRadar } from '../../components/SearchRadar';
import { useAuth } from '../../context/AuthContext';
import { useRide } from '../../context/RideContext';
import type { AppStackParamList } from '../../navigation/types';
import { useTheme } from '../../theme/ThemeContext';
import type { Theme } from '../../theme/theme';

export function HomeScreen(): React.JSX.Element {
  const t = useTheme();
  const styles = makeStyles(t);
  const { me, refreshMe } = useAuth();
  const { online, togglingOnline, goOnline, goOffline, activeDelivery } = useRide();
  const nav = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const [refreshing, setRefreshing] = React.useState(false);

  // sempre que a Home ganha foco (voltou de outra tela / reabriu o app) e
  // existe corrida em andamento, volta direto pra tela da corrida.
  useFocusEffect(
    useCallback(() => {
      if (activeDelivery && activeDelivery.status !== 'delivered') {
        nav.navigate('Entrega');
      }
    }, [activeDelivery, nav]),
  );

  const approval = me?.approvalStatus ?? 'pending_approval';
  const podeFicarOnline = approval === 'approved' && !me?.terms;

  async function onRefresh(): Promise<void> {
    setRefreshing(true);
    await refreshMe();
    setRefreshing(false);
  }

  async function handleToggle(): Promise<void> {
    if (!podeFicarOnline || togglingOnline) return;
    if (online) await goOffline();
    else await goOnline();
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.colors.primary} />}
      >
        <View style={styles.header}>
          <Avatar name={me?.fullName ?? 'Entregador'} src={me?.avatarUrl} size={38} />
          <Text style={styles.headerName} numberOfLines={1}>
            {me?.fullName ?? 'Entregador'}
          </Text>
        </View>

        <View style={styles.statusCard}>
          <View style={styles.mapBackdrop} pointerEvents="none">
            <LiveMapMini />
            <View style={styles.mapScrim} />
          </View>

          <View style={styles.statusContent}>
            {online ? (
              <>
                <SearchRadar size={188} />
                <Text style={styles.statusTitle}>Procurando entregas</Text>
                <Text style={styles.statusSubtitle}>Você está disponível — assim que surgir um pedido perto, a gente te avisa.</Text>
              </>
            ) : (
              <>
                <View style={styles.idleIcon}>
                  <Bike size={30} color={t.colors.textSecondary} strokeWidth={2} />
                </View>
                <Text style={styles.statusTitle}>Você está indisponível</Text>
                <Text style={styles.statusSubtitle}>
                  {podeFicarOnline
                    ? 'Toque no botão abaixo para começar a receber entregas.'
                    : approval === 'pending_approval'
                      ? 'Sua conta ainda não foi liberada pelo estabelecimento.'
                      : approval === 'rejected'
                        ? (me?.approvalReason ?? 'Cadastro não aprovado — fale com o suporte.')
                        : 'Aceite os termos de uso na aba Perfil para poder ficar disponível.'}
                </Text>
              </>
            )}
          </View>

          <Pressable
            onPress={() => void handleToggle()}
            disabled={!podeFicarOnline || togglingOnline}
            style={({ pressed }) => [
              styles.toggle,
              online ? styles.toggleOn : styles.toggleOff,
              (!podeFicarOnline || togglingOnline) && styles.toggleDisabled,
              pressed && styles.togglePressed,
            ]}
          >
            {togglingOnline ? (
              <ActivityIndicator size="small" color={online ? t.colors.onPrimary : t.colors.text} />
            ) : (
              <Text style={[styles.toggleLabel, online ? styles.toggleLabelOn : styles.toggleLabelOff]}>
                {online ? 'Ficar indisponível' : 'Ficar disponível'}
              </Text>
            )}
          </Pressable>
        </View>

        {approval !== 'approved' && (
          <Card style={styles.warnCard}>
            <Text style={styles.warnTitle}>
              {approval === 'pending_approval' ? 'Conta aguardando liberação' : 'Conta bloqueada'}
            </Text>
            <Text style={styles.warnText}>
              {approval === 'pending_approval'
                ? 'Fale com o estabelecimento onde você trabalha para liberar sua conta.'
                : (me?.approvalReason ?? 'Fale com o estabelecimento onde você trabalha.')}
            </Text>
          </Card>
        )}

        {approval === 'approved' && me?.terms && (
          <Card style={styles.warnCard}>
            <Text style={styles.warnTitle}>Aceite os termos de uso</Text>
            <Text style={styles.warnText}>Abra a aba Perfil e aceite os termos de uso para poder ficar disponível.</Text>
          </Card>
        )}

        <MyShiftsCard />

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{me?.rating != null ? me.rating.toFixed(1) : '—'}</Text>
            <Text style={styles.statLabel}>Nota média</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{me?.deliveriesCompleted ?? 0}</Text>
            <Text style={styles.statLabel}>Entregas feitas</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(t: Theme) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: t.colors.background },
    scroll: { padding: t.spacing.lg, paddingBottom: t.spacing.xxl, gap: t.spacing.md },

    header: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
    headerName: { fontFamily: t.fonts.headingSemiBold, fontSize: 16, color: t.colors.text, flexShrink: 1 },

    statusCard: {
      borderRadius: t.radius.lg,
      overflow: 'hidden',
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.border,
      minHeight: 440,
    },
    mapBackdrop: { ...StyleSheet.absoluteFill },
    mapScrim: {
      ...StyleSheet.absoluteFill,
      backgroundColor: t.colors.background,
      opacity: 0.82,
    },
    statusContent: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: t.spacing.xl,
      paddingTop: t.spacing.xxl,
      paddingBottom: t.spacing.lg,
      gap: t.spacing.sm,
    },
    idleIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: t.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: t.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: t.spacing.sm,
    },
    statusTitle: {
      fontFamily: t.fonts.heading,
      fontSize: 22,
      color: t.colors.text,
      textAlign: 'center',
      marginTop: t.spacing.sm,
    },
    statusSubtitle: {
      fontFamily: t.fonts.body,
      fontSize: 13,
      color: t.colors.textSecondary,
      textAlign: 'center',
      lineHeight: 19,
      maxWidth: 260,
    },

    toggle: {
      margin: t.spacing.md,
      minHeight: 54,
      borderRadius: t.radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    toggleOn: { backgroundColor: t.colors.surfaceAlt, borderWidth: 1, borderColor: t.colors.borderStrong },
    toggleOff: { backgroundColor: t.colors.primary },
    toggleDisabled: { opacity: 0.45 },
    togglePressed: { opacity: 0.85 },
    toggleLabel: { fontFamily: t.fonts.bodySemiBold, fontSize: 16 },
    toggleLabelOn: { color: t.colors.text },
    toggleLabelOff: { color: t.colors.onPrimary },

    warnCard: { borderColor: t.colors.accent },
    warnTitle: { fontFamily: t.fonts.bodySemiBold, color: t.colors.accent, fontSize: 15, marginBottom: 4 },
    warnText: { fontFamily: t.fonts.body, color: t.colors.textSecondary, fontSize: 13, lineHeight: 18 },

    statsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.lg,
      paddingVertical: t.spacing.sm,
      paddingHorizontal: t.spacing.xs,
    },
    statItem: { alignItems: 'flex-start' },
    statValue: { fontFamily: t.fonts.headingSemiBold, fontSize: 17, color: t.colors.text },
    statLabel: { fontFamily: t.fonts.body, fontSize: 11, color: t.colors.textSecondary, marginTop: 1 },
    statDivider: { width: 1, height: 28, backgroundColor: t.colors.border },
  });
}
