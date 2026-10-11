import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { EntregaScreen } from '../screens/home/EntregaScreen';
import { useTheme } from '../theme/ThemeContext';
import type { Theme } from '../theme/theme';
import { AuthNavigator } from './AuthNavigator';
import { MainTabs } from './MainTabs';
import type { AppStackParamList } from './types';

const Stack = createNativeStackNavigator<AppStackParamList>();

function AppStack(): React.JSX.Element {
  const t = useTheme();
  return (
    <Stack.Navigator screenOptions={{ contentStyle: { backgroundColor: t.colors.background } }}>
      <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
      <Stack.Screen
        name="Entrega"
        component={EntregaScreen}
        options={{
          title: 'Entrega',
          presentation: 'fullScreenModal',
          headerStyle: { backgroundColor: t.colors.surface },
          headerTintColor: t.colors.text,
          gestureEnabled: false,
        }}
      />
    </Stack.Navigator>
  );
}

export function RootNavigator(): React.JSX.Element {
  const { isLoading, isAuthenticated } = useAuth();
  const t = useTheme();
  const styles = makeStyles(t);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={t.colors.primary} size="large" />
      </View>
    );
  }
  return isAuthenticated ? <AppStack /> : <AuthNavigator />;
}

function makeStyles(t: Theme) {
  return StyleSheet.create({
    center: { flex: 1, backgroundColor: t.colors.background, alignItems: 'center', justifyContent: 'center' },
  });
}
