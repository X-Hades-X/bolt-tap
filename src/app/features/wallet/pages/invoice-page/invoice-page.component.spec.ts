import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter, Router } from '@angular/router';
import { ModalController, NavController } from '@ionic/angular/standalone';
import { BehaviorSubject, of } from 'rxjs';

import { InvoicePage } from './invoice-page.component';
import { LnurlService } from '../../../../../services/lnurl.service';
import { BleService } from '../../../../../services/ble.service';
import { InfoSheetComponent } from '../../../../shared/components/info-sheet/info-sheet.component';
import { PayResponseData, PresignedLnurl, WithdrawRequestData, WithdrawResponseData } from '../../../../../model/lnurl.model';

describe('InvoicePage', () => {
  let component: InvoicePage;
  let fixture: ComponentFixture<InvoicePage>;
  let modalCtrlSpy: jasmine.SpyObj<ModalController>;
  let lnurlServiceSpy: jasmine.SpyObj<LnurlService>;
  let pinRequestSubject: BehaviorSubject<{ amountMsat: number } | undefined>;
  let paymentStatusSubject: BehaviorSubject<WithdrawResponseData | undefined>;
  let invoiceSubject: BehaviorSubject<PresignedLnurl | PayResponseData | WithdrawRequestData | undefined>;
  let router: Router;

  beforeEach(async () => {
    pinRequestSubject = new BehaviorSubject<{ amountMsat: number } | undefined>(undefined);
    paymentStatusSubject = new BehaviorSubject<WithdrawResponseData | undefined>(undefined);
    invoiceSubject = new BehaviorSubject<PresignedLnurl | PayResponseData | WithdrawRequestData | undefined>(undefined);

    modalCtrlSpy = jasmine.createSpyObj('ModalController', ['create']);
    // Default sheet/modal behavior; individual tests override via mockModal.
    modalCtrlSpy.create.and.callFake(async () => ({
      present: jasmine.createSpy('present').and.resolveTo(undefined),
      onWillDismiss: jasmine.createSpy('onWillDismiss').and.resolveTo({ data: null, role: 'cancel' }),
    }) as never);
    lnurlServiceSpy = jasmine.createSpyObj('LnurlService', ['confirmPin', 'cancelPin', 'resetAllData', 'getLnurlData'], {
      pinRequest$: pinRequestSubject.asObservable(),
      invoiceInvoice$: invoiceSubject.asObservable(),
      paymentStatus$: paymentStatusSubject.asObservable(),
      processing$: new BehaviorSubject<boolean>(false).asObservable(),
      redeemAmountMsat: undefined,
    });

    await TestBed.configureTestingModule({
      imports: [InvoicePage],
      providers: [
        provideHttpClient(),
        provideRouter([]),
        { provide: ModalController, useValue: modalCtrlSpy },
        { provide: LnurlService, useValue: lnurlServiceSpy },
      ]
    }).compileComponents();

    router = TestBed.inject(Router);
    spyOn(router, 'navigate');

    fixture = TestBed.createComponent(InvoicePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('PIN dialog', () => {
    function mockModal(result: { data: string | null; role: string }) {
      const modal = {
        present: jasmine.createSpy('present').and.resolveTo(undefined),
        onWillDismiss: jasmine.createSpy('onWillDismiss').and.resolveTo(result),
      };
      modalCtrlSpy.create.and.resolveTo(modal as any);
      return modal;
    }

    it('should open PIN modal when pinRequest emits', async () => {
      mockModal({ data: '1234', role: 'confirm' });

      pinRequestSubject.next({ amountMsat: 250000 });
      fixture.detectChanges();
      await fixture.whenStable();

      expect(modalCtrlSpy.create).toHaveBeenCalled();
    });

    it('should call confirmPin with entered pin on confirm', async () => {
      mockModal({ data: '1234', role: 'confirm' });

      pinRequestSubject.next({ amountMsat: 250000 });
      fixture.detectChanges();
      await fixture.whenStable();

      expect(lnurlServiceSpy.confirmPin).toHaveBeenCalledWith('1234');
      expect(lnurlServiceSpy.cancelPin).not.toHaveBeenCalled();
    });

    it('should call cancelPin when modal is cancelled', async () => {
      mockModal({ data: null, role: 'cancel' });

      pinRequestSubject.next({ amountMsat: 250000 });
      fixture.detectChanges();
      await fixture.whenStable();

      expect(lnurlServiceSpy.cancelPin).toHaveBeenCalled();
      expect(lnurlServiceSpy.confirmPin).not.toHaveBeenCalled();
    });

    it('should not open a second modal while one is open', async () => {
      // Modal that never resolves onWillDismiss (simulates still-open)
      const modal = {
        present: jasmine.createSpy('present').and.resolveTo(undefined),
        onWillDismiss: jasmine.createSpy('onWillDismiss').and.returnValue(new Promise(() => {})),
      };
      modalCtrlSpy.create.and.resolveTo(modal as any);

      pinRequestSubject.next({ amountMsat: 250000 });
      fixture.detectChanges();
      await fixture.whenStable();

      pinRequestSubject.next({ amountMsat: 250000 });
      fixture.detectChanges();
      await fixture.whenStable();

      expect(modalCtrlSpy.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('payment result overlay', () => {
    function triggerPaymentStatus(status: WithdrawResponseData) {
      paymentStatusSubject.next(status);
      fixture.detectChanges();
    }

    it('should show success overlay and navigate home on Return to Home', async () => {
      triggerPaymentStatus({ status: 'OK' });
      await fixture.whenStable();

      expect(component['paymentResult']).toEqual({success: true, message: jasmine.any(String), pinRetry: false});

      component['dismissResult'](false);

      expect(component['paymentResult']).toBeUndefined();
      expect(lnurlServiceSpy.resetAllData).toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith(['tabs/wallet']);
    });

    it('should show failure overlay with reason and stay on invoice on Try Again', async () => {
      triggerPaymentStatus({ status: 'ERROR', reason: 'Wrong PIN' });
      await fixture.whenStable();

      expect(component['paymentResult']).toEqual({success: false, message: 'Wrong PIN', pinRetry: false});

      component['dismissResult'](true);

      // Stays on the invoice: overlay closed, no reset, no navigation
      expect(component['paymentResult']).toBeUndefined();
      expect(lnurlServiceSpy.resetAllData).not.toHaveBeenCalled();
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('should navigate home from failure overlay on Return to Home', async () => {
      triggerPaymentStatus({ status: 'ERROR', reason: 'Wrong PIN' });
      await fixture.whenStable();

      component['dismissResult'](false);

      expect(lnurlServiceSpy.resetAllData).toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith(['tabs/wallet']);
    });

    it('navigates back to re-enter the PIN when a fallback payment fails on it', async () => {
      const navCtrl = TestBed.inject(NavController);
      spyOn(navCtrl, 'navigateBack');
      Object.defineProperty(lnurlServiceSpy, 'isPresignFallback', {get: () => true, configurable: true});

      triggerPaymentStatus({ status: 'ERROR', reason: 'Wrong Pin. 2 tries left.' });
      await fixture.whenStable();

      expect(component['paymentResult']).toEqual({success: false, message: 'Wrong Pin. 2 tries left.', pinRetry: true});

      // Wrong PIN: no point retrying with the same stored PIN — go back and
      // collect a fresh one (amount screen re-asks it on Send).
      component['retryWithNewPin']();

      expect(component['paymentResult']).toBeUndefined();
      expect(navCtrl.navigateBack).toHaveBeenCalledWith(['/tabs/wallet/amount']);
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('renders "Enter PIN again" (not "Try Again") on a fallback PIN failure', async () => {
      Object.defineProperty(lnurlServiceSpy, 'isPresignFallback', {get: () => true, configurable: true});

      triggerPaymentStatus({ status: 'ERROR', reason: 'Wrong Pin. 2 tries left.' });
      fixture.detectChanges();

      const buttons: NodeListOf<HTMLButtonElement> = fixture.nativeElement.querySelectorAll('.result-overlay__button');
      const labels: string[] = [];
      buttons.forEach(b => labels.push(b.textContent?.trim() ?? ''));
      expect(labels).toContain('Enter PIN again');
      expect(labels).not.toContain('Try Again');
    });

    it('renders "Try Again" (not "Enter PIN again") on non-PIN failures', async () => {
      triggerPaymentStatus({ status: 'ERROR', reason: 'Payment timed out' });
      fixture.detectChanges();

      const buttons: NodeListOf<HTMLButtonElement> = fixture.nativeElement.querySelectorAll('.result-overlay__button');
      const labels: string[] = [];
      buttons.forEach(b => labels.push(b.textContent?.trim() ?? ''));
      expect(labels).toContain('Try Again');
      expect(labels).not.toContain('Enter PIN again');
    });
  });

  describe('invoice display', () => {
    // Valid signed invoice: 250000 msat (250 sats), same vector as lnurl.service.spec
    const VALID_INVOICE = 'lnbc2500n1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5w3jhxapqd9h8vmmfvdjsxqrrsscqpfv5rlghu8vkkjys69g8qjr5gz6f2k3f2gfnhjcx3xlgg6hl445e9hymafxq2vn33lr2q56u3zmaf4pvq0wynhun3fjs6uuhgmu403hagqt0vcsy';
    // Valid signed invoice without an amount section
    const NO_AMOUNT_INVOICE = 'lnbc1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq0dehjqctdda6kuaqxqrrsscqpf0pqu8xusxl0dk6u8rwtv903h4grame5pr7325g3qmceyp698u6phzy8ap8wgzexsn7qlhc6fshlm3nls0lfp48mekeyytmsd5zm0sdspkvvuk5';

    it('converts the bolt11 amount from msat to sats', () => {
      invoiceSubject.next({pr: VALID_INVOICE});
      fixture.detectChanges();

      expect(component['amount']).toBe(250);
    });

    it('shows no amount for amountless invoices instead of NaN', () => {
      invoiceSubject.next({pr: NO_AMOUNT_INVOICE});
      fixture.detectChanges();

      expect(component['amount']).toBeUndefined();
    });

    it('clears a stale payment result when a new invoice arrives', async () => {
      // Pay the first invoice successfully
      paymentStatusSubject.next({status: 'OK'});
      await fixture.whenStable();
      expect(component['paymentResult']).toEqual({success: true, message: jasmine.any(String), pinRetry: false});

      // Camera scan (native overlay, no ionViewWillLeave) brings the next invoice
      invoiceSubject.next({pr: VALID_INVOICE});
      fixture.detectChanges();

      expect(component['paymentResult']).toBeUndefined();
    });
  });

  describe('QR spoiler', () => {
    // Valid signed invoice, same vector as above
    const VALID_INVOICE = 'lnbc2500n1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5w3jhxapqd9h8vmmfvdjsxqrrsscqpfv5rlghu8vkkjys69g8qjr5gz6f2k3f2gfnhjcx3xlgg6hl445e9hymafxq2vn33lr2q56u3zmaf4pvq0wynhun3fjs6uuhgmu403hagqt0vcsy';

    it('starts blurred when an invoice arrives', () => {
      invoiceSubject.next({pr: VALID_INVOICE});
      fixture.detectChanges();

      expect(component['qrRevealed']).toBe(false);
    });

    it('reveals on first tap without copying', async () => {
      const copySpy = spyOn(component, 'copyQrData').and.resolveTo();
      invoiceSubject.next({pr: VALID_INVOICE});
      fixture.detectChanges();

      component['onQrTap']();
      await fixture.whenStable();

      expect(component['qrRevealed']).toBe(true);
      expect(copySpy).not.toHaveBeenCalled();
    });

    it('copies the QR data once revealed', async () => {
      // NOTE: Clipboard is a Capacitor registerPlugin() Proxy — Jasmine spies
      // can't attach to it. The stable seam is the component's own wrapper.
      const copySpy = spyOn(component, 'copyQrData').and.resolveTo();
      invoiceSubject.next({pr: VALID_INVOICE});
      fixture.detectChanges();

      component['onQrTap'](); // reveal
      component['onQrTap'](); // copy
      await fixture.whenStable();

      expect(copySpy).toHaveBeenCalled();
    });

    it('blurs again when a new invoice arrives', () => {
      invoiceSubject.next({pr: VALID_INVOICE});
      fixture.detectChanges();
      component['onQrTap']();
      expect(component['qrRevealed']).toBe(true);

      invoiceSubject.next({pr: VALID_INVOICE});
      fixture.detectChanges();

      expect(component['qrRevealed']).toBe(false);
    });
  });

  describe('presign fallback display (stock lnurlw)', () => {
    const storedWithdraw: WithdrawRequestData = {
      tag: 'withdrawRequest',
      callback: 'https://example.com/cb',
      k1: 'k',
      minWithdrawable: 1000, // 1 sat floor
      maxWithdrawable: 100000000,
      defaultDescription: 'Test card',
    };

    /** Emits the fallback artifact: stored withdraw data (no lnurl string, no network). */
    function emitStoredWithdraw(redeemMsat?: number) {
      Object.defineProperty(lnurlServiceSpy, 'redeemAmountMsat', {get: () => redeemMsat, configurable: true});
      Object.defineProperty(lnurlServiceSpy, 'isPresignFallback', {get: () => redeemMsat !== undefined, configurable: true});

      invoiceSubject.next(storedWithdraw);
      fixture.detectChanges();
    }

    it('shows the entered amount instead of the stock minWithdrawable', () => {
      emitStoredWithdraw(5000000); // user entered 5000 sats

      expect(component['amount']).toBe(5000);
    });

    it('hides the QR frame in fallback mode (tap-only)', () => {
      emitStoredWithdraw(5000000);
      fixture.detectChanges();

      expect(component['isPresignFallback']).toBe(true);
      expect(component['canvasReady']).toBe(false);
      expect(component['qrData']).toBeUndefined();
      expect(fixture.nativeElement.querySelector('.qr-frame')).toBeNull();
      expect(fixture.nativeElement.querySelector('.scan-note')).toBeNull();
    });

    it('keeps the QR surface for real vouchers (lnurl artifact)', () => {
      Object.defineProperty(lnurlServiceSpy, 'isPresignFallback', {get: () => false, configurable: true});
      (lnurlServiceSpy.getLnurlData as jasmine.Spy).and.returnValue(of(storedWithdraw));
      (component as any).qrCanvas = {nativeElement: document.createElement('canvas')};

      invoiceSubject.next({lnurl: 'lnurlw://example.com/l', status: 'OK'});
      fixture.detectChanges();

      expect(component['isPresignFallback']).toBe(false);
      expect(fixture.nativeElement.querySelector('.qr-frame')).not.toBeNull();
    });
  });

  describe('printing indicator', () => {
    let bleService: BleService;

    beforeEach(() => {
      bleService = TestBed.inject(BleService);
    });

    it('shows the full-screen printing indicator immediately on print tap', async () => {
      spyOn(bleService, 'print').and.returnValue(new Promise<void>(() => {}));

      component['onPrint']();

      // Feedback must be synchronous — image load, encode and BLE transfer
      // take seconds before the printer visibly starts.
      expect(component['printing']).toBe(true);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.result-overlay--printing')).not.toBeNull();

      // Let the zone-tracked image load settle while the print spy is still
      // installed, so the deferred runPrint never reaches the real BleService.
      await fixture.whenStable();
    });

    it('clears the indicator and shows a success sheet when the job finishes', async () => {
      spyOn(bleService, 'print').and.resolveTo(undefined);
      component['printing'] = true;

      component['runPrint'](document.createElement('canvas'));
      await fixture.whenStable();

      expect(component['printing']).toBe(false);
      expect(modalCtrlSpy.create).toHaveBeenCalledWith(jasmine.objectContaining({
        component: InfoSheetComponent,
        componentProps: jasmine.objectContaining({ title: 'Print finished' }),
      }));
    });

    it('clears the indicator and shows a failure sheet when the job fails', async () => {
      spyOn(bleService, 'print').and.rejectWith(new Error('boom'));
      component['printing'] = true;

      component['runPrint'](document.createElement('canvas'));
      await fixture.whenStable();

      expect(component['printing']).toBe(false);
      expect(modalCtrlSpy.create).toHaveBeenCalledWith(jasmine.objectContaining({
        component: InfoSheetComponent,
        componentProps: jasmine.objectContaining({ title: 'Print failed' }),
      }));
    });

    it('resets and navigates home when the finished sheet is confirmed', async () => {
      spyOn(bleService, 'print').and.resolveTo(undefined);
      modalCtrlSpy.create.and.resolveTo({
        present: jasmine.createSpy('present').and.resolveTo(undefined),
        onWillDismiss: jasmine.createSpy('onWillDismiss').and.resolveTo({ role: 'confirm' }),
      } as never);

      component['runPrint'](document.createElement('canvas'));
      await fixture.whenStable();

      expect(lnurlServiceSpy.resetAllData).toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith(['tabs/wallet']);
    });

    it('stays put when the finished sheet is dismissed', async () => {
      spyOn(bleService, 'print').and.resolveTo(undefined);

      component['runPrint'](document.createElement('canvas'));
      await fixture.whenStable();

      expect(lnurlServiceSpy.resetAllData).not.toHaveBeenCalled();
      expect(router.navigate).not.toHaveBeenCalled();
    });
  });

  describe('ionViewWillLeave', () => {
    it('resets local state and all service data', () => {
      component['paymentResult'] = {success: true, message: 'ok', pinRetry: false};

      component.ionViewWillLeave();

      expect(component['paymentResult']).toBeUndefined();
      expect(lnurlServiceSpy.resetAllData).toHaveBeenCalled();
    });
  });
});
