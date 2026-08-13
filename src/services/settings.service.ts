import {Injectable} from '@angular/core';
import {BehaviorSubject} from 'rxjs';

const STORAGE_KEY = 'boltTap.presignEnabled';
const PRESIGN_INFO_SEEN_KEY = 'boltTap.presignInfoSeen';
const PRINTER_INFO_SEEN_KEY = 'boltTap.printerInfoSeen';

/**
 * App-wide feature toggles, persisted in the WebView's localStorage.
 *
 * presignEnabled gates the presigned-voucher probe on Send. Default OFF:
 * presign is a private backend extension (pin_presign fork); a stock LNbits
 * answers the probe with 'Missing payment request.' and the app falls
 * through to plain pay-from-card. Users on the fork switch this on to get
 * printable bearer vouchers.
 *
 * The *InfoSeen flags remember whether a feature's explanation sheet was
 * already shown (manually via the settings info icon or automatically on
 * first activation) — first activation forces the sheet once, then never
 * nags again.
 */
@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private readonly presignEnabledSubject = new BehaviorSubject<boolean>(this.load());
  public readonly presignEnabled$ = this.presignEnabledSubject.asObservable();

  get presignEnabled(): boolean {
    return this.presignEnabledSubject.value;
  }

  setPresignEnabled(enabled: boolean) {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
    this.presignEnabledSubject.next(enabled);
  }

  get presignInfoSeen(): boolean {
    return localStorage.getItem(PRESIGN_INFO_SEEN_KEY) === '1';
  }

  markPresignInfoSeen() {
    localStorage.setItem(PRESIGN_INFO_SEEN_KEY, '1');
  }

  get printerInfoSeen(): boolean {
    return localStorage.getItem(PRINTER_INFO_SEEN_KEY) === '1';
  }

  markPrinterInfoSeen() {
    localStorage.setItem(PRINTER_INFO_SEEN_KEY, '1');
  }

  private load(): boolean {
    return localStorage.getItem(STORAGE_KEY) === '1';
  }
}
