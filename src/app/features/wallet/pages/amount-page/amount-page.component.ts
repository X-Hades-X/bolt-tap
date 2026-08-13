import {Component, DestroyRef, inject, OnInit} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {CommonModule} from '@angular/common';
import {LnurlService} from '../../../../../services/lnurl.service';
import {LnurlData, WithdrawRequestData} from '../../../../../model/lnurl.model';
import {SatsFormatPipe} from '../../../../shared/pipes/sats-format.pipe';
import {NumpadComponent} from '../../../../shared/components/numpad/numpad.component';
import {msatToSats, satsToMsat} from '../../../../shared/utils/units';
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ModalController,
  NavController
} from '@ionic/angular/standalone';
import {PinDialogComponent} from '../../components/pin-dialog/pin-dialog.component';

@Component({
  selector: 'app-amount-page',
  templateUrl: './amount-page.component.html',
  styleUrls: ['./amount-page.component.scss'],
  standalone: true,
  host: { class: 'ion-page' },
  imports: [
    CommonModule,
    SatsFormatPipe,
    NumpadComponent,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonSpinner,
  ],
})
export class AmountPage implements OnInit {
  private readonly _navController = inject(NavController);
  private readonly _lnurlService = inject(LnurlService);
  private readonly _destroyRef = inject(DestroyRef);
  private readonly _modalCtrl = inject(ModalController);

  private _lnurl?: LnurlData;

  /** Raw digit string backing the amount readout (whole sats). */
  protected amountDigits = '';

  protected minSats = 0;
  protected maxSats = 0;
  protected pinLimitSats?: number;
  protected isWithdraw = false;

  /** True while waiting for the server to issue the invoice/voucher. */
  protected submitting = false;
  /** Server rejection reason (e.g. wrong PIN), shown inline. */
  protected submitError?: string;

  ngOnInit() {
    this._lnurlService.lnurlInvoice$
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe((data) => {
        if (!data) {
          return;
        }

        this._lnurl = data;
        this.isWithdraw = data.tag === 'withdrawRequest';

        if (data.tag === 'withdrawRequest') {
          this.minSats = msatToSats(data.minWithdrawable);
          this.maxSats = msatToSats(data.maxWithdrawable);
          this.pinLimitSats = data.pinLimit === undefined ? undefined : msatToSats(data.pinLimit);
        } else if (data.tag === 'payRequest') {
          this.minSats = msatToSats(data.minSendable);
          this.maxSats = msatToSats(data.maxSendable);
          this.pinLimitSats = undefined;
        } else {
          return;
        }

        if (this.minSats === this.maxSats) {
          void this.proceedWithAmount(data, this.minSats);
        } else {
          // Start empty; the info line shows the min/max range. First digit
          // typed becomes the amount.
          this.amountDigits = '';
        }
      });
  }

  get amountSats(): number {
    const parsed = Number.parseInt(this.amountDigits, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  get hasValue(): boolean {
    return this.amountDigits.length > 0;
  }

  get amountValid(): boolean {
    return this.hasValue && this.amountSats >= this.minSats && this.amountSats <= this.maxSats;
  }

  get actionLabel(): string {
    return this.isWithdraw ? 'Send' : 'Receive';
  }

  onDigit(d: string) {
    // Prevent leading zeroes and unreasonably long input
    if (this.amountDigits === '0') {
      this.amountDigits = d;
      return;
    }
    if (this.amountDigits.length >= 9) {
      return;
    }
    this.amountDigits += d;
  }

  onBackspace() {
    this.amountDigits = this.amountDigits.slice(0, -1);
  }

  protected async onConfirm() {
    if (this._lnurl && this.amountValid) {
      await this.proceedWithAmount(this._lnurl, this.amountSats);
    }
  }

  private async proceedWithAmount(data: LnurlData, amountSats: number) {
    const pin = await this.collectPinIfRequired(data, amountSats);
    if (pin === null) {
      // User cancelled PIN entry
      return;
    }

    // Wait for the server response before navigating: a rejected PIN or any
    // other error keeps the user here with the reason shown inline.
    this.submitting = true;
    this.submitError = undefined;
    this._lnurlService.fetchInvoice(data, undefined, amountSats, pin).subscribe({
      next: () => {
        this.submitting = false;
        void this._navController.navigateForward('/tabs/wallet/invoice');
      },
      error: (err) => {
        this.submitting = false;
        this.submitError = err instanceof Error ? err.message : 'Request failed. Please try again.';
      },
    });
  }

  /** LUD-24: a PIN is mandatory once the amount reaches pinLimit (msat). */
  private async collectPinIfRequired(data: LnurlData, amountSats: number): Promise<string | null | undefined> {
    if (data.tag !== 'withdrawRequest') {
      return undefined;
    }

    const withdrawData = data as WithdrawRequestData;
    if (!withdrawData.pinLimit || satsToMsat(amountSats) < withdrawData.pinLimit) {
      return undefined;
    }

    const modal = await this._modalCtrl.create({
      component: PinDialogComponent,
      breakpoints: [0, 0.75],
      initialBreakpoint: 0.75,
      cssClass: 'pin-sheet-modal',
    });
    await modal.present();

    const {data: pin, role} = await modal.onWillDismiss<string>();
    if (role === 'confirm' && pin) {
      return pin;
    }
    return null;
  }
}
