import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PushNotificationService {
  constructor(private http: HttpClient) {}

  async subscribe(): Promise<void> {
    console.log('[Push] Démarrage...');

    if (!('serviceWorker' in navigator)) {
      console.error('[Push] ❌ Service Worker non supporté');
      return;
    }
    if (!('PushManager' in window)) {
      console.error('[Push] ❌ PushManager non supporté');
      return;
    }

    try {
      const registration = await navigator.serviceWorker.register('/sw-push.js', {
        scope: '/',
        updateViaCache: 'none'
      });
      console.log('[Push] ✅ SW enregistré, état:', registration.active?.state);

      await navigator.serviceWorker.ready;
      console.log('[Push] ✅ SW prêt');

      const permission = await Notification.requestPermission();
      console.log('[Push] Permission:', permission);
      if (permission !== 'granted') {
        console.warn('[Push] ⚠️ Permission refusée');
        return;
      }

      const res = await this.http
        .get<any>(`${environment.apiUrl}/push/vapid-public-key`).toPromise();
      console.log('[Push] Clé VAPID:', res?.publicKey ? '✅ présente' : '❌ ABSENTE');

      if (!res?.publicKey) {
        console.error('[Push] ❌ Clé VAPID absente');
        return;
      }

      const existingSub = await registration.pushManager.getSubscription();
      if (existingSub) {
        console.log('[Push] Désabonnement ancienne souscription...');
        await existingSub.unsubscribe();
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(res.publicKey) as unknown as BufferSource // ✅ cast
      });
      console.log('[Push] ✅ Souscription créée:', subscription.endpoint.substring(0, 50) + '...');

      const saveRes = await this.http
        .post<any>(`${environment.apiUrl}/push/subscribe`, subscription.toJSON()).toPromise();
      console.log('[Push] ✅ Enregistré en base:', saveRes?.success);

    } catch (err: any) {
      console.error('[Push] ❌ Erreur:', err?.message || err);
    }
  }

  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const buffer = new ArrayBuffer(rawData.length);
    const outputArray = new Uint8Array(buffer);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }
}