import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { NavController } from '@ionic/angular/standalone';
import { BehaviorSubject } from 'rxjs';

import { WalletPage } from './wallet-page.component';
import { NfcService } from '../../../../../services/nfc.service';
import { NDEFMessage } from '@exxili/capacitor-nfc';

describe('WalletPage', () => {
  let component: WalletPage;
  let fixture: ComponentFixture<WalletPage>;
  let navCtrlSpy: jasmine.SpyObj<NavController>;
  let tagSubject: BehaviorSubject<NDEFMessage<string>[] | undefined>;

  beforeEach(async () => {
    tagSubject = new BehaviorSubject<NDEFMessage<string>[] | undefined>(undefined);
    navCtrlSpy = jasmine.createSpyObj('NavController', ['navigateForward']);
    const nfcServiceSpy = jasmine.createSpyObj('NfcService', ['startScan', 'enableNfc$'], {
      tag$: tagSubject.asObservable(),
    });

    await TestBed.configureTestingModule({
      imports: [WalletPage],
      providers: [
        provideHttpClient(),
        provideRouter([]),
        { provide: NavController, useValue: navCtrlSpy },
        { provide: NfcService, useValue: nfcServiceSpy },
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(WalletPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('tag$ navigation guard', () => {
    const fakeTag = [{ records: [] }] as unknown as NDEFMessage<string>[];

    it('should navigate to details on tag when page is active', () => {
      component.ionViewWillEnter();

      tagSubject.next(fakeTag);

      expect(navCtrlSpy.navigateForward).toHaveBeenCalledWith('/tabs/wallet/details');
    });

    it('should not navigate on tag when page is not active', () => {
      component.ionViewWillEnter();
      component.ionViewWillLeave();

      tagSubject.next(fakeTag);

      expect(navCtrlSpy.navigateForward).not.toHaveBeenCalled();
    });

    it('should not navigate on tag before page is ever entered', () => {
      tagSubject.next(fakeTag);

      expect(navCtrlSpy.navigateForward).not.toHaveBeenCalled();
    });

    it('should resume navigation after re-entering the page', () => {
      component.ionViewWillEnter();
      component.ionViewWillLeave();
      component.ionViewWillEnter();

      tagSubject.next(fakeTag);

      expect(navCtrlSpy.navigateForward).toHaveBeenCalledWith('/tabs/wallet/details');
    });
  });
});
