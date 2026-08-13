import {Component, DestroyRef, inject} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {CommonModule} from '@angular/common';
import {NfcService} from '../../../../../services/nfc.service';
import {LnurlService} from '../../../../../services/lnurl.service';
import {Clipboard} from '@capacitor/clipboard';
import {
  IonContent,
  IonIcon,
  NavController
} from '@ionic/angular/standalone';
import {NfcScannerComponent} from '../../components/nfc-scanner/nfc-scanner.component';
import {addIcons} from 'ionicons';
import {warningOutline} from 'ionicons/icons';

@Component({
  selector: 'app-wallet',
  templateUrl: 'wallet-page.component.html',
  styleUrls: ['wallet-page.component.scss'],
  standalone: true,
  host: { class: 'ion-page' },
  imports: [
    CommonModule,
    IonContent,
    IonIcon,
    NfcScannerComponent,
  ],
})
export class WalletPage {
  private readonly _navController = inject(NavController);
  private readonly _nfcService = inject(NfcService);
  private readonly _lnurlService = inject(LnurlService);
  private readonly _destroyRef = inject(DestroyRef);

  currentPhase: 'init' | 'error' = 'init';

  // Only react to NFC tags while this page is in the foreground. Otherwise a
  // card tap on a later screen (e.g. invoice) would also trigger navigation
  // here, hijacking the flow and loading the card as a new wallet.
  private _isActive = false;

  constructor() {
    addIcons({warningOutline});

    this._lnurlService.invoiceInvoice$
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe((data) => {
        if (!data) {
          this.reset();
        }
      });

    this._nfcService.tag$
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe((tag) => {
        if (tag && this._isActive) {
          void this._navController.navigateForward('/tabs/wallet/details');
        }
      });
  }

  ionViewWillEnter() {
    this._isActive = true;
  }

  ionViewWillLeave() {
    this._isActive = false;
  }

  async readClipboard() {
    try {
      const {value} = await Clipboard.read();
      this._lnurlService.resetAllData();
      const parsed = this._lnurlService.parseLnurl(value);
      // Invoices navigate themselves to the invoice page inside parseLnurl.
      if (parsed === 'lnurl') {
        void this._navController.navigateForward('/tabs/wallet/details');
      }
    } catch {
      this.currentPhase = 'error';
    }
  }

  protected reset() {
    this.currentPhase = 'init';
  }
}
