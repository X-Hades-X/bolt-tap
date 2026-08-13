import {Component, DestroyRef, inject} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {CommonModule} from '@angular/common';
import {LnurlService} from '../../../../../services/lnurl.service';
import {PayRequestData, WithdrawRequestData} from '../../../../../model/lnurl.model';
import {SatsFormatPipe} from '../../../../shared/pipes/sats-format.pipe';
import {msatToSats} from '../../../../shared/utils/units';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonSpinner,
  IonTitle,
  IonToolbar,
  NavController
} from '@ionic/angular/standalone';
import {addIcons} from 'ionicons';
import {
  caretDownOutline,
  caretUpOutline,
  closeOutline,
  lockClosedOutline,
  playForwardOutline,
  returnUpBackOutline,
  returnUpForwardOutline
} from 'ionicons/icons';

@Component({
  selector: 'app-wallet-details',
  templateUrl: 'wallet-details-page.component.html',
  styleUrls: ['wallet-details-page.component.scss'],
  standalone: true,
  host: { class: 'ion-page' },
  imports: [
    CommonModule,
    SatsFormatPipe,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonIcon,
    IonTitle,
    IonContent,
    IonSpinner,
  ],
})
export class WalletDetailsPage {
  private readonly _navController = inject(NavController);
  private readonly _lnurlService = inject(LnurlService);
  private readonly _destroyRef = inject(DestroyRef);

  /** How long to wait for card data before offering a retry. */
  private static readonly READ_TIMEOUT_MS = 10000;

  currentPhase: 'loading' | 'result' | 'error' = 'loading';
  errorMessage = '';

  lnurlWithdrawData?: WithdrawRequestData;
  lnurlPayData?: PayRequestData;

  limitsExpanded = false;
  titleExpanded = false;

  private _readTimeout?: ReturnType<typeof setTimeout>;

  constructor() {
    addIcons({
      closeOutline,
      returnUpBackOutline,
      returnUpForwardOutline,
      caretDownOutline,
      caretUpOutline,
      lockClosedOutline,
      playForwardOutline,
    });

    this._lnurlService.lnurlWithdraw$
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe((data) => {
        if (data) {
          clearTimeout(this._readTimeout);
          this.currentPhase = 'result';
        }
        this.lnurlWithdrawData = data;
      });

    this._lnurlService.lnurlPay$
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe((data) => {
        if (data) {
          clearTimeout(this._readTimeout);
          this.currentPhase = 'result';
        }
        this.lnurlPayData = data;
      });

    this._lnurlService.lnurlError$
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe((message) => {
        if (message) {
          this.errorMessage = message;
          this.currentPhase = 'error';
        }
      });

    // Local watchdog: if no card data arrives at all (e.g. the tag carried no
    // LNURL record, so no request was ever fired), don't spin forever.
    this._readTimeout = setTimeout(() => {
      if (this.currentPhase === 'loading') {
        this.errorMessage = 'Reading the card timed out. Please tap again.';
        this.currentPhase = 'error';
      }
    }, WalletDetailsPage.READ_TIMEOUT_MS);

    this._destroyRef.onDestroy(() => clearTimeout(this._readTimeout));
  }

  /** Retry loading by resetting back to the scan screen. */
  protected retry() {
    this.reset();
  }

  /** Card title from the LNURL metadata; truncated + expandable when long. */
  get cardTitle(): string {
    if (this.lnurlWithdrawData?.defaultDescription) {
      return this.lnurlWithdrawData.defaultDescription;
    }
    if (this.lnurlPayData?.metadata) {
      return this.extractLabelFromMetadata(this.lnurlPayData.metadata);
    }
    return 'Bolt Card';
  }

  get receiveMinSats(): number {
    return msatToSats(this.lnurlPayData?.minSendable ?? 0);
  }

  get receiveMaxSats(): number {
    return msatToSats(this.lnurlPayData?.maxSendable ?? 0);
  }

  get sendMaxSats(): number {
    return msatToSats(this.lnurlWithdrawData?.maxWithdrawable ?? 0);
  }

  get pinLimitSats(): number | undefined {
    const pinLimit = this.lnurlWithdrawData?.pinLimit;
    return pinLimit === undefined ? undefined : msatToSats(pinLimit);
  }

  toggleLimits() {
    this.limitsExpanded = !this.limitsExpanded;
  }

  toggleTitle() {
    this.titleExpanded = !this.titleExpanded;
  }

  private extractLabelFromMetadata(metadata: string): string {
    try {
      const parsed = JSON.parse(metadata) as [string, string][];
      const textEntry = parsed.find(([key]) => key === 'text/plain' || key === 'text/identifier');
      return textEntry?.[1] ?? 'Bolt Card';
    } catch {
      return 'Bolt Card';
    }
  }

  protected onReceive() {
    if (this.lnurlPayData) {
      let copy = structuredClone(this.lnurlPayData);
      this._lnurlService.setInvoice(copy);
      void this._navController.navigateForward('/tabs/wallet/amount');
    }
  }

  protected onWithdraw() {
    if (this.lnurlWithdrawData) {
      let copy = structuredClone(this.lnurlWithdrawData);
      this._lnurlService.setInvoice(copy);
      void this._navController.navigateForward('/tabs/wallet/amount');
    }
  }

  protected reset() {
    this._lnurlService.resetAllData();
    this.lnurlPayData = undefined;
    this.lnurlWithdrawData = undefined;
    this.currentPhase = 'loading';
    void this._navController.navigateBack('/tabs/wallet');
  }
}
