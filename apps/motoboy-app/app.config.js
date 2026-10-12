/**
 * Config dinâmica do Expo.
 *
 * Arquivo do Firebase (push nativo): no build da EAS vem da env var de
 * arquivo GOOGLE_SERVICES_JSON / GOOGLE_SERVICES_PLIST (secret, configurada
 * com `eas env:create --type file`); localmente, do arquivo na raiz. Sem
 * nenhum dos dois o app compila igual, só sem push. Ver FIREBASE-SETUP.md.
 */
const fs = require('fs');
const path = require('path');

// No build da EAS o arquivo do Firebase chega como env var de arquivo
// (GOOGLE_SERVICES_JSON = caminho). Localmente, cai pro arquivo na raiz.
const androidFirebasePath =
  process.env.GOOGLE_SERVICES_JSON && fs.existsSync(process.env.GOOGLE_SERVICES_JSON)
    ? process.env.GOOGLE_SERVICES_JSON
    : fs.existsSync(path.join(__dirname, 'google-services.json'))
      ? path.join(__dirname, 'google-services.json')
      : null;
const iosFirebasePath =
  process.env.GOOGLE_SERVICES_PLIST && fs.existsSync(process.env.GOOGLE_SERVICES_PLIST)
    ? process.env.GOOGLE_SERVICES_PLIST
    : fs.existsSync(path.join(__dirname, 'GoogleService-Info.plist'))
      ? path.join(__dirname, 'GoogleService-Info.plist')
      : null;
const hasAndroidFirebase = !!androidFirebasePath;
const hasIosFirebase = !!iosFirebasePath;

const BRAND = '#1f6f5c';
const DARK = '#141513';

module.exports = () => ({
  expo: {
    name: 'Leeva Motoboy',
    // projeto EAS: @leeva-jp/leeva (org "leeva-jp", slug "leeva", id 5c851aad-...)
    owner: 'leeva-jp',
    slug: 'leeva',
    scheme: 'leevamotoboy',
    version: '1.0.17',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'dark',
    backgroundColor: DARK,
    assetBundlePatterns: ['**/*'],

    ios: {
      supportsTablet: false,
      bundleIdentifier: 'br.com.leeva.motoboy',
      ...(hasIosFirebase ? { googleServicesFile: iosFirebasePath } : {}),
      infoPlist: {
        UIBackgroundModes: ['location'],
        NSLocationWhenInUseUsageDescription:
          'O Leeva usa sua localização para te oferecer entregas próximas e mostrar sua posição durante a entrega.',
        NSLocationAlwaysAndWhenInUseUsageDescription:
          'Durante uma entrega, o Leeva continua enviando sua localização mesmo com o app em segundo plano, para o restaurante e o cliente acompanharem.',
      },
    },

    android: {
      package: 'br.com.leeva.motoboy',
      versionCode: 18,
      ...(hasAndroidFirebase ? { googleServicesFile: androidFirebasePath } : {}),
      adaptiveIcon: {
        backgroundColor: BRAND,
        foregroundImage: './assets/adaptive-icon.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      permissions: [
        'ACCESS_COARSE_LOCATION',
        'ACCESS_FINE_LOCATION',
        'ACCESS_BACKGROUND_LOCATION',
        'FOREGROUND_SERVICE',
        'FOREGROUND_SERVICE_LOCATION',
        'POST_NOTIFICATIONS',
        'WAKE_LOCK',
      ],
    },

    plugins: [
      'expo-font',
      'expo-audio',
      [
        'expo-splash-screen',
        {
          image: './assets/splash-icon.png',
          imageWidth: 180,
          resizeMode: 'contain',
          backgroundColor: DARK,
        },
      ],
      [
        'expo-notifications',
        {
          icon: './assets/android-icon-monochrome.png',
          color: BRAND,
        },
      ],
      [
        'expo-location',
        {
          locationAlwaysAndWhenInUsePermission:
            'Durante uma entrega, o Leeva continua enviando sua localização em segundo plano para o restaurante e o cliente acompanharem.',
          locationWhenInUsePermission: 'O Leeva usa sua localização para te oferecer entregas próximas.',
          isAndroidBackgroundLocationEnabled: true,
          isAndroidForegroundServiceEnabled: true,
        },
      ],
      [
        'expo-image-picker',
        {
          cameraPermission: 'O Leeva usa a câmera para você tirar a foto que comprova a entrega.',
        },
      ],
    ],

    extra: {
      // ID do projeto EAS (conta Expo do dono). Ligado via `eas init`.
      eas: {
        projectId: '5c851aad-66e2-4c2c-8f3f-c2fd80b620d9',
      },
      // usado por src/lib/push.ts para saber se o push nativo está viável
      firebaseConfigured: hasAndroidFirebase || hasIosFirebase,
    },
  },
});
