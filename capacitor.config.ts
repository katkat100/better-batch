import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.github.katkat100.betterbatch',
  appName: 'Better Batch',
  webDir: 'build',
  ios: {
    contentInset: 'never',
    backgroundColor: '#F5F2ED'
  },
  android: {
    backgroundColor: '#F5F2ED'
  }
};

export default config;
