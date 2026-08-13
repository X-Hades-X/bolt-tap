import {inject, Injectable, NgZone} from '@angular/core';
import {Router} from '@angular/router';
import {Capacitor} from '@capacitor/core';
import {App} from '@capacitor/app';
import {LnurlService} from './lnurl.service';

/** Ignore a deep link identical to one handled within this window: a cold
 * start via an ACTION_VIEW link both replays a retained appUrlOpen event and
 * returns the same URL from getLaunchUrl(). */
const DEEP_LINK_DEDUP_MS = 5000;

/**
 * Entry point for links and NFC tag taps that arrive while the app is in the
 * background or not running (see the intent filters in AndroidManifest.xml):
 * Bolt Tap is offered for lnurlw/lnurlp/lightning links and for Bolt Card
 * taps (NDEF tags carrying an lnurlw/lnurlp URI record).
 */
@Injectable({providedIn: 'root'})
export class DeepLinkService {
  private readonly _router = inject(Router);
  private readonly _ngZone = inject(NgZone);
  private readonly _lnurlService = inject(LnurlService);

  private _lastDeepLink?: {url: string, at: number};
  private _initialized = false;

  /** Wires deep links: warm-start appUrlOpen events plus the cold-start
   * launch URL. Call once at app start; later calls are no-ops. */
  async init() {
    if (this._initialized || !Capacitor.isNativePlatform()) {
      return;
    }
    this._initialized = true;

    // Warm-start link taps (lnurlw/lnurlp/lightning ACTION_VIEW intents). NFC
    // tag taps never arrive here: the App plugin only fires appUrlOpen for
    // ACTION_VIEW — tags go through the NFC plugin's onRead path instead.
    await this.registerUrlListener();

    // Cold start via a Bolt Card tap: the NDEF_DISCOVERED launch intent is not
    // an ACTION_VIEW (no appUrlOpen) and the NFC plugin's event fired before
    // the WebView loaded — the launch URL is the only way in.
    const launchUrl = await this.readLaunchUrl();
    if (launchUrl) {
      this.handleDeepLink(launchUrl);
    }
  }

  handleDeepLink(url: string) {
    const now = Date.now();
    if (this._lastDeepLink?.url === url && now - this._lastDeepLink.at < DEEP_LINK_DEDUP_MS) {
      return;
    }
    this._lastDeepLink = {url, at: now};

    // Plugin callbacks run outside the Angular zone.
    this._ngZone.run(() => {
      try {
        const parsed = this._lnurlService.parseLnurl(url);
        // Invoices navigate themselves to the invoice page inside parseLnurl.
        if (parsed === 'lnurl') {
          void this._router.navigate(['/tabs/wallet/details']);
        }
      } catch {
        // Not an lnurl/invoice link — ignore.
      }
    });
  }

  /** Wrapper seam: Capacitor registerPlugin() proxies can't be spied on. */
  protected async registerUrlListener(): Promise<void> {
    await App.addListener('appUrlOpen', (event) => this.handleDeepLink(event.url));
  }

  /** Wrapper seam: Capacitor registerPlugin() proxies can't be spied on. */
  protected async readLaunchUrl(): Promise<string | undefined> {
    return (await App.getLaunchUrl())?.url;
  }
}
