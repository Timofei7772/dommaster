import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.zaru.smeta',
    appName: 'ZARU Смета',
    webDir: 'dist',
    server: {
        androidScheme: 'https'
    },
    plugins: {
        SplashScreen: {
            launchShowDuration: 2000,
            launchAutoHide: true,
            backgroundColor: '#4F46E5',
            showSpinner: true,
            spinnerColor: '#FFFFFF'
        },
        StatusBar: {
            style: 'dark',
            backgroundColor: '#4F46E5'
        }
    },
    android: {
        allowMixedContent: true,
        captureInput: true,
        webContentsDebuggingEnabled: true
    }
};

export default config;
