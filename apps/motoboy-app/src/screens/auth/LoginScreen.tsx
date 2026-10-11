import React, { useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/Button';
import { ScreenContainer } from '../../components/ScreenContainer';
import { TextField } from '../../components/TextField';
import { useAuth } from '../../context/AuthContext';
import { API_URL } from '../../lib/supabase';
import { useTheme } from '../../theme/ThemeContext';
import type { Theme } from '../../theme/theme';

export function LoginScreen(): React.JSX.Element {
  const styles = makeStyles(useTheme());
  const { login, configured } = useAuth();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(): Promise<void> {
    if (!email.trim() || !senha) {
      Alert.alert('Preencha os campos', 'Informe e-mail e senha.');
      return;
    }
    setLoading(true);
    try {
      await login(email, senha);
    } catch (e) {
      Alert.alert('Não foi possível entrar', (e as Error).message || 'Confira e-mail e senha.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScreenContainer scroll>
      <View style={styles.header}>
        <Text style={styles.logo}>Leeva</Text>
        <Text style={styles.tagline}>Entregas pra você fazer.</Text>
      </View>

      {!configured && (
        <Text style={styles.warn}>
          App sem configuração de servidor. Defina EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY.
        </Text>
      )}

      <View style={styles.form}>
        <TextField
          label="E-mail"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="voce@email.com"
        />
        <TextField label="Senha" value={senha} onChangeText={setSenha} secureTextEntry placeholder="Sua senha" />

        <Button label="Entrar" onPress={handleSubmit} loading={loading} style={styles.submit} />

        <Pressable onPress={() => void Linking.openURL(`${API_URL}/esqueci-senha`)}>
          <Text style={styles.forgot}>Esqueci minha senha</Text>
        </Pressable>

        <Button
          label="Primeiro acesso? Ativar conta"
          variant="outline"
          onPress={() => void Linking.openURL(`${API_URL}/ativar`)}
        />
        <Text style={styles.hint}>Quem cadastra você é o estabelecimento onde você trabalha. Use o convite que ele mandou no WhatsApp.</Text>
      </View>
    </ScreenContainer>
  );
}

function makeStyles(t: Theme) {
  return StyleSheet.create({
    header: { marginTop: t.spacing.xxl, marginBottom: t.spacing.xl, alignItems: 'center' },
    logo: { fontFamily: t.fonts.heading, fontSize: 40, color: t.colors.primary },
    tagline: { fontFamily: t.fonts.body, fontSize: 14, color: t.colors.textSecondary, marginTop: t.spacing.xs },
    warn: { fontFamily: t.fonts.body, fontSize: 13, color: t.colors.danger, marginBottom: t.spacing.md },
    form: { flex: 1, justifyContent: 'center' },
    submit: { marginTop: t.spacing.sm, marginBottom: t.spacing.md },
    forgot: { fontFamily: t.fonts.bodySemiBold, fontSize: 14, color: t.colors.primary, textAlign: 'center', marginBottom: t.spacing.md },
    hint: { fontFamily: t.fonts.body, fontSize: 12, color: t.colors.textSecondary, marginTop: t.spacing.sm, textAlign: 'center' },
  });
}
