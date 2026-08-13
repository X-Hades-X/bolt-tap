import {ComponentFixture, TestBed, waitForAsync} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {provideRouter} from '@angular/router';
import {ModalController, NavController} from '@ionic/angular/standalone';
import {BehaviorSubject, of, throwError} from 'rxjs';

import {AmountPage} from './amount-page.component';
import {LnurlService} from '../../../../../services/lnurl.service';
import {LnurlData, WithdrawRequestData} from '../../../../../model/lnurl.model';

describe('AmountPage', () => {
  let component: AmountPage;
  let fixture: ComponentFixture<AmountPage>;
  let lnurlServiceSpy: jasmine.SpyObj<LnurlService>;
  let navCtrlSpy: jasmine.SpyObj<NavController>;
  let modalCtrlSpy: jasmine.SpyObj<ModalController>;
  let lnurlInvoiceSubject: BehaviorSubject<LnurlData | undefined>;

  const mockWithdrawData: WithdrawRequestData = {
    tag: 'withdrawRequest',
    callback: 'https://example.com/cb',
    k1: 'test-k1',
    minWithdrawable: 100000,
    maxWithdrawable: 500000,
  };

  const typeAmount = (amount: string) => {
    for (const d of amount) {
      component.onDigit(d);
    }
  };

  const setAmount = (amount: string) => {
    component['amountDigits'] = amount;
  };

  beforeEach(waitForAsync(() => {
    lnurlInvoiceSubject = new BehaviorSubject<LnurlData | undefined>(undefined);

    lnurlServiceSpy = jasmine.createSpyObj('LnurlService', ['fetchInvoice'], {
      lnurlInvoice$: lnurlInvoiceSubject.asObservable(),
    });
    lnurlServiceSpy.fetchInvoice.and.returnValue(of({lnurl: 'lnurl1test', status: 'OK'}));
    navCtrlSpy = jasmine.createSpyObj('NavController', ['navigateForward']);
    modalCtrlSpy = jasmine.createSpyObj('ModalController', ['create']);

    TestBed.configureTestingModule({
      imports: [AmountPage],
      providers: [
        provideHttpClient(),
        provideRouter([]),
        {provide: LnurlService, useValue: lnurlServiceSpy},
        {provide: NavController, useValue: navCtrlSpy},
        {provide: ModalController, useValue: modalCtrlSpy},
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AmountPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('starts empty with min/max range for a variable withdraw request', () => {
    lnurlInvoiceSubject.next(mockWithdrawData);
    fixture.detectChanges();

    expect(component['minSats']).toBe(100);
    expect(component['maxSats']).toBe(500);
    expect(component['amountDigits']).toBe('');
    expect(component.amountSats).toBe(0);
    expect(component.amountValid).toBeFalse(); // empty until user types
  });

  it('auto-submits when min equals max', async () => {
    const fixedData: WithdrawRequestData = {
      ...mockWithdrawData,
      minWithdrawable: 100000,
      maxWithdrawable: 100000,
    };
    lnurlInvoiceSubject.next(fixedData);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(lnurlServiceSpy.fetchInvoice).toHaveBeenCalledWith(fixedData, undefined, 100, undefined);
    expect(navCtrlSpy.navigateForward).toHaveBeenCalledWith('/tabs/wallet/invoice');
  });

  it('appends digits and validates range', () => {
    lnurlInvoiceSubject.next(mockWithdrawData);
    fixture.detectChanges();

    setAmount('');
    typeAmount('250');
    expect(component.amountSats).toBe(250);
    expect(component.amountValid).toBeTrue();
  });

  it('flags out-of-range amounts as invalid', () => {
    lnurlInvoiceSubject.next(mockWithdrawData);
    fixture.detectChanges();

    setAmount('50'); // below min 100
    expect(component.amountValid).toBeFalse();

    setAmount('999'); // above max 500
    expect(component.amountValid).toBeFalse();
  });

  it('avoids leading zeroes', () => {
    lnurlInvoiceSubject.next(mockWithdrawData);
    fixture.detectChanges();

    setAmount('0');
    component.onDigit('5');
    expect(component['amountDigits']).toBe('5');
  });

  it('backspace removes the last digit', () => {
    lnurlInvoiceSubject.next(mockWithdrawData);
    fixture.detectChanges();

    setAmount('123');
    component.onBackspace();
    expect(component['amountDigits']).toBe('12');
  });

  it('should call fetchInvoice on confirm with entered amount', async () => {
    lnurlInvoiceSubject.next(mockWithdrawData);
    fixture.detectChanges();

    setAmount('250');
    await component['onConfirm']();
    await fixture.whenStable();

    expect(lnurlServiceSpy.fetchInvoice).toHaveBeenCalledWith(mockWithdrawData, undefined, 250, undefined);
    expect(navCtrlSpy.navigateForward).toHaveBeenCalledWith('/tabs/wallet/invoice');
  });

  it('should not call fetchInvoice when amount is invalid', async () => {
    lnurlInvoiceSubject.next(mockWithdrawData);
    fixture.detectChanges();

    setAmount(''); // empty
    await component['onConfirm']();
    await fixture.whenStable();

    expect(lnurlServiceSpy.fetchInvoice).not.toHaveBeenCalled();
  });

  it('should stay on page and show error when the server rejects (e.g. wrong PIN)', async () => {
    lnurlInvoiceSubject.next(mockWithdrawData);
    fixture.detectChanges();

    lnurlServiceSpy.fetchInvoice.and.returnValue(
      throwError(() => new Error('Wrong Pin. 2 tries left.'))
    );

    setAmount('250');
    await component['onConfirm']();
    await fixture.whenStable();

    expect(component['submitting']).toBeFalse();
    expect(component['submitError']).toBe('Wrong Pin. 2 tries left.');
    expect(navCtrlSpy.navigateForward).not.toHaveBeenCalled();
  });

  describe('PIN flow', () => {
    it('should show PIN dialog when amount >= pinLimit', async () => {
      const pinProtectedData: WithdrawRequestData = {
        ...mockWithdrawData,
        pinLimit: 200000, // 200 sats
      };
      lnurlInvoiceSubject.next(pinProtectedData);
      fixture.detectChanges();

      const mockModal = {
        present: jasmine.createSpy('present').and.resolveTo(undefined),
        onWillDismiss: jasmine.createSpy('onWillDismiss').and.resolveTo({data: '1234', role: 'confirm'}),
      };
      modalCtrlSpy.create.and.resolveTo(mockModal as any);

      setAmount('250');
      await component['onConfirm']();
      await fixture.whenStable();

      expect(modalCtrlSpy.create).toHaveBeenCalled();
      expect(lnurlServiceSpy.fetchInvoice).toHaveBeenCalledWith(pinProtectedData, undefined, 250, '1234');
    });

    it('should not show PIN dialog when amount < pinLimit', async () => {
      const pinProtectedData: WithdrawRequestData = {
        ...mockWithdrawData,
        pinLimit: 300000, // 300 sats
      };
      lnurlInvoiceSubject.next(pinProtectedData);
      fixture.detectChanges();

      setAmount('250');
      await component['onConfirm']();
      await fixture.whenStable();

      expect(modalCtrlSpy.create).not.toHaveBeenCalled();
      expect(lnurlServiceSpy.fetchInvoice).toHaveBeenCalledWith(pinProtectedData, undefined, 250, undefined);
    });

    it('should not proceed when PIN dialog is cancelled', async () => {
      const pinProtectedData: WithdrawRequestData = {
        ...mockWithdrawData,
        pinLimit: 200000,
      };
      lnurlInvoiceSubject.next(pinProtectedData);
      fixture.detectChanges();

      const mockModal = {
        present: jasmine.createSpy('present').and.resolveTo(undefined),
        onWillDismiss: jasmine.createSpy('onWillDismiss').and.resolveTo({data: null, role: 'cancel'}),
      };
      modalCtrlSpy.create.and.resolveTo(mockModal as any);

      setAmount('250');
      await component['onConfirm']();
      await fixture.whenStable();

      expect(modalCtrlSpy.create).toHaveBeenCalled();
      expect(lnurlServiceSpy.fetchInvoice).not.toHaveBeenCalled();
      expect(navCtrlSpy.navigateForward).not.toHaveBeenCalled();
    });

    it('should not show PIN dialog for payRequest', async () => {
      const payData: LnurlData = {
        tag: 'payRequest',
        callback: 'https://example.com/cb',
        minSendable: 100000,
        maxSendable: 500000,
      };
      lnurlInvoiceSubject.next(payData);
      fixture.detectChanges();

      setAmount('250');
      await component['onConfirm']();
      await fixture.whenStable();

      expect(modalCtrlSpy.create).not.toHaveBeenCalled();
      expect(lnurlServiceSpy.fetchInvoice).toHaveBeenCalledWith(payData, undefined, 250, undefined);
    });
  });
});
