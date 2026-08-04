// Platform and device detection
class PlatformDetector {
  isNative = $state(false);
  platform = $state('web');
  isMobile = $state(false);
  isIOS = $state(false);
  isAndroid = $state(false);

  constructor() {
    this.detectPlatform();
  }

  detectPlatform() {
    if (typeof window === 'undefined') {
      this.platform = 'server';
      return;
    }

    if (window.Capacitor) {
      this.isNative = true;
      const devicePlatform = window.Capacitor.getPlatform();
      this.platform = devicePlatform;
      this.isIOS = devicePlatform === 'ios';
      this.isAndroid = devicePlatform === 'android';
      this.isMobile = true;
    } else {
      this.isNative = false;
      this.platform = 'web';
      this.isMobile = /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent);
      this.isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      this.isAndroid = /Android/i.test(navigator.userAgent);
    }
  }
}

export const platform = new PlatformDetector();