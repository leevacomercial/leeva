import { type NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { Alert, Image, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { DeliveryChat } from '../../components/DeliveryChat';
import { MapaEntrega } from '../../components/MapaEntrega';
import { ScreenContainer } from '../../components/ScreenContainer';
import { StatusBadge } from '../../components/StatusBadge';
import { usePosition } from '../../context/PositionContext';
import { useAuth } from '../../context/AuthContext';
import { useRide } from '../../context/RideContext';
import type { AppStackParamList } from '../../navigation/types';
import { useTheme } from '../../theme/ThemeContext';
import type { Theme } from '../../theme/theme';
import type { Delivery, OrderStatus } from '../../types';

type Props = NativeStackScreenProps<AppStackParamList, 'Entrega'>;

const ACAO: Partial<Record<OrderStatus, string>> = {
  assigned: 'Cheguei — coletar o pedido',
  picked_up: 'Sair para a entrega',
};

const brl = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`;
const hhmm = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

function prepBadge(d: Delivery, t: Theme): { text: string; color: string } | null {
  if (d.readyAt) return { text: '🔔 Pronto pra retirada', color: t.colors.success };
  if (!d.preparingAt) return null;
  if (!d.prepEstimateMinutes) return { text: 'Em preparo', color: t.colors.accent };
  const leftMin = Math.round((new Date(d.preparingAt).getTime() + d.prepEstimateMinutes * 60_000 - Date.now()) / 60_000);
  return {
    text: leftMin > 0 ? `Em preparo · pronto em ~${leftMin} min` : 'Em preparo · deveria estar pronto',
    color: t.colors.accent,
  };
}

async function takeDeliveryPhoto(): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Precisamos da câmera', 'Permita o uso da câmera para tirar a foto da entrega.');
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({
    quality: 0.35,
    base64: true,
    exif: false,
  });
  if (result.canceled || !result.assets?.[0]?.base64) return null;
  const asset = result.assets[0];
  const mime = asset.mimeType ?? 'image/jpeg';
  return `data:${mime};base64,${asset.base64}`;
}

export function EntregaScreen({ navigation }: Props): React.JSX.Element {
  const t = useTheme();
  const styles = makeStyles(t);
  const { activeDelivery, nextDeliveries, route, advancing, advanceActive, confirmDelivery, doFirst, resetRoute, pickUpAll } = useRide();
  const { position } = usePosition();
  const [photo, setPhoto] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [ifoodOk, setIfoodOk] = useState(false);
  const { me } = useAuth();

  if (!activeDelivery) {
    return (
      <ScreenContainer>
        <Text style={styles.empty}>Nenhuma entrega em andamento.</Text>
        <Button label="Voltar" onPress={() => navigation.goBack()} style={{ marginTop: t.spacing.lg }} />
      </ScreenContainer>
    );
  }

  const d = activeDelivery;
  const naColeta = d.status === 'assigned';
  const alvo = naColeta
    ? { lat: d.pickupLat, lng: d.pickupLng, endereco: d.pickupAddress ?? d.pickupName }
    : { lat: d.dropoffLat, lng: d.dropoffLng, endereco: d.dropoffAddress };
  const acaoLabel = ACAO[d.status];
  const entregue = d.status === 'delivered';
  const isIfood = d.source === 'ifood';
  // loja com iFood integrado: o código do cliente é conferido pelo Leeva no
  // iFood; sem integração, o motoboy confirma no site do iFood (ifoodSite)
  const ifoodSite = isIfood && !me?.ifoodLogistics;
  const codeLen = isIfood ? 6 : 4;
  const codeReady = isIfood ? code.trim().length === 0 || code.trim().length >= 4 : code.trim().length >= 4;
  const collectFromCustomer = d.paymentStatus !== 'paid' && d.paymentMethod !== 'online';

  function abrirMapa(): void {
    if (alvo.lat == null || alvo.lng == null) return;
    void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${alvo.lat},${alvo.lng}`);
  }

  return (
    <ScreenContainer scroll>
      <Text style={styles.title}>{entregue ? 'Entrega concluída' : 'Entrega em andamento'}</Text>
      <StatusBadge status={d.status} />
      {naColeta &&
        (() => {
          const pb = prepBadge(d, t);
          if (!pb) return null;
          return (
            <View style={[styles.prepBadge, { backgroundColor: pb.color + '22', borderColor: pb.color }]}>
              <Text style={[styles.prepBadgeText, { color: pb.color }]}>{pb.text}</Text>
            </View>
          );
        })()}

      {nextDeliveries.length > 0 && !entregue && (
        <Card style={[styles.card, { marginTop: t.spacing.md }]}>
          <Text style={styles.label}>
            Sua rota: {nextDeliveries.length + 1} paradas{route?.totalKm ? ` · ~${route.totalKm.toFixed(1)} km` : ''}
          </Text>
          <Text style={[styles.dest, { marginTop: 0, color: route?.lateMinutes ? t.colors.accent : t.colors.textSecondary }]}>
            {route?.lateMinutes
              ? `Nessa ordem, algum pedido passa ~${route.lateMinutes} min do prazo.`
              : 'Ordem montada pra ninguém atrasar. Você pode mudar lá embaixo.'}
          </Text>
          <View style={{ gap: t.spacing.sm, marginTop: t.spacing.sm }}>
            {route?.navigationUrl ? (
              <Button label="Rota completa no Google Maps" variant="outline" onPress={() => void Linking.openURL(route.navigationUrl!)} />
            ) : null}
            {naColeta && nextDeliveries.some((n) => n.status === 'assigned') ? (
              <Button
                label={`Retirei todos (${1 + nextDeliveries.filter((n) => n.status === 'assigned').length} pedidos)`}
                loading={advancing}
                onPress={() => void pickUpAll()}
              />
            ) : null}
          </View>
        </Card>
      )}

      <Card style={styles.valorCard}>
        <Text style={styles.valorLabel}>Você recebe por esta entrega</Text>
        <Text style={styles.valor}>{d.payout != null ? brl(d.payout) : '—'}</Text>
      </Card>

      {ifoodSite && (
        <Card style={[styles.card, { borderColor: t.colors.accent }]}>
          <Text style={styles.label}>Pedido do iFood — localizador</Text>
          <Text style={styles.localizador}>{d.ifoodLocator ?? '—'}</Text>
          <Text style={styles.dest}>
            Na entrega, abra o link do iFood, digite o localizador, peça o código ao cliente e confirme lá.
          </Text>
          <View style={{ marginTop: t.spacing.sm }}>
            <Button
              label="Abrir confirmação do iFood"
              variant="outline"
              onPress={() => void Linking.openURL('https://confirmacao-entrega-propria.ifood.com.br/')}
            />
          </View>
        </Card>
      )}

      {collectFromCustomer && (
        <Card style={[styles.card, { borderColor: t.colors.accent }]}>
          <Text style={styles.label}>Receber do cliente na entrega</Text>
          <Text style={styles.endereco}>{brl(d.orderAmount)}</Text>
        </Card>
      )}

      <View style={styles.actions}>
        {!entregue && alvo.lat != null && (
          <Button label={`Abrir no mapa (${naColeta ? 'coleta' : 'entrega'})`} variant="outline" onPress={abrirMapa} />
        )}
        {!entregue && acaoLabel && (
          <Button label={acaoLabel} onPress={() => void advanceActive()} loading={advancing} />
        )}

        {d.status === 'in_route' && (
          <View style={{ gap: t.spacing.sm }}>
            <Text style={styles.dest}>
              {ifoodSite
                ? 'Para concluir, confirme no link do iFood, tire uma foto da entrega e marque abaixo. Você precisa estar no endereço.'
                : isIfood
                  ? 'Para concluir, tire uma foto da entrega e digite o código de entrega do iFood que o cliente informar. Você precisa estar no endereço.'
                  : 'Para concluir, tire uma foto da entrega e peça pro cliente o código de confirmação dele. Você precisa estar no endereço.'}
            </Text>
            {!photo ? (
              <Button
                label="Tirar foto da entrega"
                variant="outline"
                onPress={async () => setPhoto(await takeDeliveryPhoto())}
              />
            ) : (
              <>
                <Image source={{ uri: photo }} style={styles.fotoPreview} />
                <Button label="Tirar outra" variant="outline" onPress={() => setPhoto(null)} />
                {ifoodSite ? (
                  <Pressable style={styles.checkRow} onPress={() => setIfoodOk((v) => !v)}>
                    <Text style={styles.checkBox}>{ifoodOk ? '☑' : '☐'}</Text>
                    <Text style={styles.checkLabel}>Confirmei a entrega no link do iFood</Text>
                  </Pressable>
                ) : (
                  <TextInput
                    style={styles.codeInput}
                    placeholder={isIfood ? 'Código de entrega do iFood' : 'Código de confirmação do cliente'}
                    placeholderTextColor={t.colors.textSecondary}
                    keyboardType="number-pad"
                    maxLength={codeLen}
                    value={code}
                    onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, codeLen))}
                  />
                )}
                <Button
                  label="Confirmar entrega"
                  disabled={ifoodSite ? !ifoodOk : !codeReady}
                  loading={advancing}
                  onPress={async () => {
                    if (!photo) return;
                    const ok = await confirmDelivery(photo, code.trim(), ifoodSite ? ifoodOk : undefined);
                    if (ok) {
                      setPhoto(null);
                      setCode('');
                      setIfoodOk(false);
                    }
                  }}
                />
              </>
            )}
          </View>
        )}

        {!entregue && d.pickupPhone ? (
          <Button
            label="WhatsApp do restaurante"
            variant="outline"
            onPress={() => void Linking.openURL(`https://wa.me/55${d.pickupPhone!.replace(/\D/g, '')}`)}
          />
        ) : null}
        {!entregue ? <DeliveryChat orderId={d.id} /> : null}

        {entregue && <Button label="Concluir" onPress={() => navigation.goBack()} />}
      </View>

      <Card style={styles.card}>
        <Text style={styles.label}>Coleta</Text>
        <Text style={styles.endereco}>{d.pickupName}</Text>
        {d.pickupAddress ? <Text style={styles.dest}>{d.pickupAddress}</Text> : null}
      </Card>

      <Card style={styles.card}>
        <Text style={styles.label}>Entrega</Text>
        <Text style={styles.endereco}>{d.dropoffAddress}</Text>
        <Text style={styles.dest}>
          {d.customerName}
          {d.customerPhone ? ` · ${d.customerPhone}` : ''}
        </Text>
      </Card>

      {d.notes ? (
        <Card style={styles.card}>
          <Text style={styles.label}>Observações</Text>
          <Text style={styles.endereco}>{d.notes}</Text>
        </Card>
      ) : null}

      {nextDeliveries.length > 0 && (
        <Card style={styles.card}>
          <View style={styles.nextHeader}>
            <Text style={styles.label}>Próximas ({nextDeliveries.length})</Text>
            <Pressable onPress={() => void resetRoute()} disabled={advancing}>
              <Text style={styles.link}>Usar ordem sugerida</Text>
            </Pressable>
          </View>
          {nextDeliveries.map((n, i) => (
            <View key={n.id} style={styles.nextRow}>
              <Text style={styles.nextNum}>{i + 2}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.endereco}>{n.customerName}</Text>
                <Text style={[styles.dest, { marginTop: 2 }]}>{n.dropoffAddress}</Text>
                {n.routeEta ? (
                  <Text style={[styles.dest, { marginTop: 2, color: n.routeLate ? t.colors.accent : t.colors.textSecondary }]}>
                    chega ~{hhmm(n.routeEta)}{n.routeLate ? ' · passa do prazo' : ''}
                  </Text>
                ) : null}
              </View>
              {d.status !== 'in_route' ? (
                <Pressable style={styles.nowBtn} onPress={() => void doFirst(n.id)} disabled={advancing}>
                  <Text style={styles.nowBtnText}>Fazer agora</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </Card>
      )}

      {d.pickupLat != null && d.dropoffLat != null && (
        <MapaEntrega
          pickupLat={d.pickupLat}
          pickupLng={d.pickupLng as number}
          dropoffLat={d.dropoffLat}
          dropoffLng={d.dropoffLng as number}
          motoboyLat={position?.latitude}
          motoboyLng={position?.longitude}
          style={styles.mapa}
        />
      )}
    </ScreenContainer>
  );
}

function makeStyles(t: Theme) {
  return StyleSheet.create({
    title: { fontFamily: t.fonts.heading, fontSize: 24, color: t.colors.text, marginBottom: t.spacing.sm },
    prepBadge: {
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderRadius: t.radius.pill,
      paddingVertical: 5,
      paddingHorizontal: 12,
      marginTop: t.spacing.sm,
    },
    prepBadgeText: { fontFamily: t.fonts.bodySemiBold, fontSize: 12.5 },
    valorCard: { marginTop: t.spacing.md, marginBottom: t.spacing.md, alignItems: 'center' },
    valorLabel: { fontFamily: t.fonts.body, fontSize: 13, color: t.colors.textSecondary },
    valor: { fontFamily: t.fonts.heading, fontSize: 32, color: t.colors.success, marginTop: 4 },
    card: { marginBottom: t.spacing.md },
    label: { fontFamily: t.fonts.bodySemiBold, fontSize: 12, color: t.colors.accent, marginBottom: 4 },
    endereco: { fontFamily: t.fonts.body, fontSize: 15, color: t.colors.text, lineHeight: 20 },
    fotoPreview: { width: '100%', height: 200, borderRadius: t.radius.md, resizeMode: 'cover' },
    codeInput: {
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: t.radius.md,
      paddingHorizontal: t.spacing.md,
      paddingVertical: 12,
      fontFamily: t.fonts.bodySemiBold,
      fontSize: 18,
      letterSpacing: 4,
      textAlign: 'center',
      color: t.colors.text,
      backgroundColor: t.colors.surface,
    },
    localizador: { fontFamily: t.fonts.heading, fontSize: 30, letterSpacing: 4, color: t.colors.text, marginVertical: 4 },
    checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
    checkBox: { fontSize: 24, color: t.colors.primary },
    checkLabel: { flex: 1, fontFamily: t.fonts.bodySemiBold, fontSize: 14, color: t.colors.text },
    dest: { fontFamily: t.fonts.body, fontSize: 13, color: t.colors.textSecondary, marginTop: 6 },
    mapa: { height: 240, borderRadius: t.radius.lg, borderWidth: 1, borderColor: t.colors.border, marginBottom: t.spacing.md },
    actions: { marginTop: t.spacing.sm, gap: t.spacing.md },
    nextHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    link: { fontFamily: t.fonts.bodySemiBold, fontSize: 12.5, color: t.colors.primary },
    nextRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: t.colors.border,
      marginTop: 6,
    },
    nextNum: { fontFamily: t.fonts.heading, fontSize: 18, color: t.colors.textSecondary, width: 22, textAlign: 'center' },
    nowBtn: {
      borderWidth: 1,
      borderColor: t.colors.primary,
      borderRadius: t.radius.pill,
      paddingVertical: 6,
      paddingHorizontal: 12,
    },
    nowBtnText: { fontFamily: t.fonts.bodySemiBold, fontSize: 12.5, color: t.colors.primary },
    empty: { fontFamily: t.fonts.body, color: t.colors.textSecondary, textAlign: 'center', marginTop: t.spacing.xxl },
  });
}
