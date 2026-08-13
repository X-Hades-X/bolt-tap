import {AfterViewInit, Component, DestroyRef, ElementRef, inject, NgZone, ViewChild} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {CommonModule} from '@angular/common';
import {Router} from '@angular/router';
import QRCode from 'qrcode';
import {decode} from 'light-bolt11-decoder';
import {Clipboard} from '@capacitor/clipboard';
import {LnurlService} from '../../../../../services/lnurl.service';
import {BleService} from '../../../../../services/ble.service';
import {environment} from '../../../../../environments/environment';
import {WithdrawResponseData} from '../../../../../model/lnurl.model';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ModalController,
  NavController,
  ViewWillLeave
} from '@ionic/angular/standalone';
import {NfcScannerComponent} from '../../components/nfc-scanner/nfc-scanner.component';
import {PrintPreviewComponent} from '../../../../shared/components/print-preview/print-preview.component';
import {InfoSheetComponent} from '../../../../shared/components/info-sheet/info-sheet.component';
import {PinDialogComponent} from '../../components/pin-dialog/pin-dialog.component';
import {SatsFormatPipe} from '../../../../shared/pipes/sats-format.pipe';
import {msatToSats} from '../../../../shared/utils/units';
import {composeLabelCanvas} from '../../../../shared/utils/print-canvas';
import {IonIcon} from '@ionic/angular/standalone';
import {addIcons} from 'ionicons';
import {checkmarkCircleOutline, closeCircleOutline, eyeOffOutline, homeOutline} from 'ionicons/icons';

@Component({
  selector: 'app-invoice',
  templateUrl: 'invoice-page.component.html',
  styleUrls: ['invoice-page.component.scss'],
  standalone: true,
  host: { class: 'ion-page' },
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonSpinner,
    IonButton,
    NfcScannerComponent,
    PrintPreviewComponent,
    SatsFormatPipe,
    IonIcon,
  ],
})
export class InvoicePage implements AfterViewInit, ViewWillLeave {
  private readonly _ngZone = inject(NgZone);
  private readonly _lnurlService = inject(LnurlService);
  private readonly _router = inject(Router);
  private readonly _bleService = inject(BleService);
  private readonly _modalCtrl = inject(ModalController);
  private readonly _navCtrl = inject(NavController);
  private readonly _destroyRef = inject(DestroyRef);

  protected title = '';
  protected amount?: number;
  protected qrData?: string;
  protected canvasReady = false;

  /** Display metadata for the info rows. */
  protected networkLabel = 'Lightning';
  protected amountLabel = 'Invoice amount';
  protected actionHint = 'Tap your Bolt Card to pay';
  protected label?: string;
  protected processing = false;

  /** True while a print job is encoded, transferred and spooled — drives the
   *  full-screen printing indicator (the printer gives no feedback of its own
   *  until it starts, which otherwise looks like the tap did nothing). */
  protected printing = false;

  /** 'pay' = card pays an invoice, 'receive' = card tops up from a withdraw. */
  protected direction: 'pay' | 'receive' = 'pay';

  /** False in the printer-less ("noble") build variant. */
  protected readonly printerEnabled = environment.printer;

  /** True during a stock-backend presign fallback: tap-only, no QR/print. */
  protected get isPresignFallback(): boolean {
    return this._lnurlService.isPresignFallback;
  }

  /** Set when a payment result arrives; drives the full-screen overlay.
   *  pinRetry: fallback payment failed on the PIN — retry navigates back to
   *  the amount screen so the PIN can be requested again (updated PIN comes
   *  back built into a fresh fallback); staying on the disabled result makes
   *  no sense there because retrying would reuse the same wrong PIN. */
  protected paymentResult?: {success: boolean, message: string, pinRetry: boolean};

  /** QR stays blurred until tapped — invoices/vouchers are spendable secrets. */
  protected qrRevealed = false;

  private _pinModalOpen = false;

  @ViewChild('qrCanvas') qrCanvas!: ElementRef<HTMLCanvasElement>;

  get printerConnected() {
    return !!this._bleService.device && this._bleService.client?.isConnected();
  }

  constructor() {
    addIcons({checkmarkCircleOutline, closeCircleOutline, eyeOffOutline, homeOutline});
  }

  /** Leaving the invoice page resets everything — next visit starts clean. */
  ionViewWillLeave() {
    this.paymentResult = undefined;
    this._lnurlService.resetAllData();
  }

  ngAfterViewInit() {
    this._lnurlService.invoiceInvoice$
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe((data) => {
        if (data) {
          // A new invoice/voucher replaces any result of the previous one
          // (camera scans don't fire ionViewWillLeave).
          this.paymentResult = undefined;
          // New invoice starts blurred again.
          this.qrRevealed = false;
          if ('pr' in data) {
            this.title = 'Pay invoice';
            this.networkLabel = 'Lightning';
            this.amountLabel = 'Invoice amount';
            this.actionHint = 'Tap your Bolt Card to pay';
            this.direction = 'pay';
            this.qrData = data.pr;
            try {
              const decodedInvoice = decode(this.qrData);
              const amountValue = decodedInvoice.sections.find((section) => section.name === 'amount')?.value;
              // Amountless invoices are valid bolt11: show no amount, not NaN.
              this.amount = amountValue === undefined ? undefined : msatToSats(Number(amountValue));
              this.label = this.extractInvoiceDescription(decodedInvoice);
            } catch {
              // Malformed bolt11 (e.g. truncated paste): fail visibly instead
              // of bubbling to a raw toast with a spinner spinning forever.
              this.amount = undefined;
              this.label = undefined;
              this.paymentResult = {
                success: false,
                message: 'This does not look like a valid Lightning invoice.',
                pinRetry: false,
              };
            }
          } else if ('lnurl' in data) {
            this.title = 'LNURL';
            this.networkLabel = 'Lightning Top-Up';
            this.amountLabel = 'Top-Up amount';
            this.actionHint = 'Tap your Bolt Card to receive';
            this.direction = 'receive';
            this.qrData = data.lnurl.replace('https', 'lnurlw');
            this._lnurlService.getLnurlData(data.lnurl)
              .pipe(takeUntilDestroyed(this._destroyRef))
              .subscribe((lnurlData) => {
                if (lnurlData?.tag === 'withdrawRequest') {
                  this.title = 'Withdraw';
                  this.amount = msatToSats(this._lnurlService.redeemAmountMsat ?? lnurlData.minWithdrawable);
                  this.label = lnurlData.defaultDescription;
                } else if (lnurlData?.tag === 'payRequest') {
                  this.title = 'Pay';
                  this.amount = msatToSats(lnurlData.minSendable);
                } else {
                  throw new Error('Was expecting a withdraw or pay request response.');
                }
              });
          } else if (data.tag === 'withdrawRequest') {
            // Presign fallback: stored card data is the artifact — NO network
            // (the lnurlw link is a one-shot credential). Tap-only view:
            // amount = what the user entered, nil qr.
            this.title = 'Withdraw';
            this.networkLabel = 'Lightning Top-Up';
            this.amountLabel = 'Top-Up amount';
            this.actionHint = 'Tap your Bolt Card to receive';
            this.direction = 'receive';
            this.qrData = undefined;
            this.amount = msatToSats(this._lnurlService.redeemAmountMsat ?? data.minWithdrawable);
            this.label = data.defaultDescription;
          } else {
            throw new Error('Was expecting an invoice, a voucher, or withdraw data.');
          }

          // Fallback artifacts are tap-only: no QR exists for them (and with
          // the canvas hidden, qrCanvas is undefined).
          if (!this.isPresignFallback && this.qrCanvas && this.qrData) {
            QRCode.toCanvas(
              this.qrCanvas.nativeElement,
              this.qrData,
              {
                width: 280,
                margin: 2
              },
              (err) => {
                if (err) {
                  console.error(err);
                } else {
                  this._ngZone.run(() => this.canvasReady = true);
                }
              }
            );
          }
        }
      });

    this._lnurlService.paymentStatus$
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe((paymentStatus) => {
        if (paymentStatus) {
          this._ngZone.run(() => this.showPaymentResult(paymentStatus));
        }
      });

    this._lnurlService.pinRequest$
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe((pinRequest) => {
        if (pinRequest) {
          void this.showPinDialog();
        }
      });

    this._lnurlService.processing$
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe((processing) => {
        this._ngZone.run(() => this.processing = processing);
      });
  }

  private async showPinDialog() {
    if (this._pinModalOpen) {
      return;
    }
    this._pinModalOpen = true;

    const modal = await this._modalCtrl.create({
      component: PinDialogComponent,
      breakpoints: [0, 0.75],
      initialBreakpoint: 0.75,
      cssClass: 'pin-sheet-modal',
    });
    await modal.present();

    const {data: pin, role} = await modal.onWillDismiss<string>();
    this._pinModalOpen = false;

    if (role === 'confirm' && pin) {
      this._lnurlService.confirmPin(pin);
    } else {
      this._lnurlService.cancelPin();
    }
  }

  /** First tap un-blurs; taps on the revealed QR copy its data. */
  protected onQrTap() {
    if (!this.qrRevealed) {
      this.qrRevealed = true;
      return;
    }
    void this.copyQrData();
  }

  async copyQrData() {
    if (this.qrData) {
      await Clipboard.write({string: this.qrData});
    }
  }

  protected async onPrint() {
    // Immediate feedback — the job below (image load, encode, BLE transfer,
    // printer spool) takes several seconds before the printer visibly starts.
    this.printing = true;

    try {
      const canvas = await composeLabelCanvas(this.qrCanvas.nativeElement);
      this.runPrint(canvas);
    } catch (err) {
      console.error('Failed to compose the print label:', err);
      this.printing = false;
      void this.showPrintFailedSheet();
    }
  }

  /** One print attempt with user-visible success and failure feedback. */
  private runPrint(canvas: HTMLCanvasElement) {
    this._bleService.print(canvas)
      .then(() => {
        void this.showPrintFinishedSheet();
      })
      .catch((err) => {
        console.error('Print failed:', err);
        void this.showPrintFailedSheet();
      })
      .finally(() => {
        // BLE callbacks settle outside the Angular zone.
        this._ngZone.run(() => this.printing = false);
      });
  }

  private async showPrintFailedSheet() {
    const modal = await this._modalCtrl.create({
      component: InfoSheetComponent,
      componentProps: {
        title: 'Print failed',
        sections: [{text: 'The printer did not finish the job. Check the printer and its connection, then try again.'}],
        buttons: [{text: 'OK', role: 'cancel'}],
      },
      cssClass: 'info-sheet-modal',
    });
    await modal.present();
  }

  private async showPrintFinishedSheet() {
    const modal = await this._modalCtrl.create({
      component: InfoSheetComponent,
      componentProps: {
        title: 'Print finished',
        sections: [{text: 'Return to the home screen or print again?'}],
        buttons: [
          {text: 'Repeat', role: 'cancel', style: 'ghost'},
          {text: 'OK', role: 'confirm'},
        ],
      },
      cssClass: 'info-sheet-modal',
    });
    await modal.present();

    const {role} = await modal.onWillDismiss();
    if (role === 'confirm') {
      this._lnurlService.resetAllData();
      void this._router.navigate(['tabs/wallet']);
    }
  }

  private showPaymentResult(paymentStatus: WithdrawResponseData) {
    const success = paymentStatus.status.toLowerCase() === 'ok';
    this.paymentResult = {
      success,
      message: paymentStatus.reason ?? 'The payment could not be completed.',
      // Fork backends answer a wrong/required PIN at the paying callback
      // ('Wrong Pin. N tries left.', variants possible); only meaningful in
      // the presign fallback, where the PIN is validated late. Any PIN-related
      // reason in fallback must re-request the PIN, not retry the dead one.
      pinRetry: !success && this.isPresignFallback === true && /pin/i.test(paymentStatus.reason ?? ''),
    };
  }

  /** PIN failed in the fallback: go back to the amount screen. Digits and
   * card data are preserved in the stack; hitting Send there re-asks for the
   * PIN and returns here fresh, with it updated. */
  protected retryWithNewPin() {
    this.paymentResult = undefined;
    this._navCtrl.navigateBack(['/tabs/wallet/amount']);
  }

  /** Success: only way out is home. Failure: retry (re-tap) or go home. */
  protected dismissResult(tryAgain: boolean) {
    this.paymentResult = undefined;
    if (!tryAgain) {
      this._lnurlService.resetAllData();
      void this._router.navigate(['tabs/wallet']);
    }
    // On tryAgain we stay on the invoice so the user can re-tap the card.
  }

  finishPrint() {
    this._lnurlService.resetAllData();
    void this._router.navigate(['tabs/wallet']);
  }

  protected returnHome() {
    this._lnurlService.resetAllData();
    void this._router.navigate(['tabs/wallet']);
  }

  /** Pulls a human-readable description out of a decoded bolt11 invoice. */
  private extractInvoiceDescription(decoded: ReturnType<typeof decode>): string | undefined {
    const section = decoded.sections.find((s) => s.name === 'description');
    const value = (section as { value?: string } | undefined)?.value;
    return value && value.length > 0 ? value : undefined;
  }
}
