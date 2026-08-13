import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalController } from '@ionic/angular/standalone';

import { SettingsPage } from './settings-page.component';
import { InfoSheetComponent } from '../../../../shared/components/info-sheet/info-sheet.component';

describe('SettingsPage', () => {
  let component: SettingsPage;
  let fixture: ComponentFixture<SettingsPage>;
  let modalCtrlSpy: jasmine.SpyObj<ModalController>;

  beforeEach(async () => {
    localStorage.clear();
    modalCtrlSpy = jasmine.createSpyObj('ModalController', ['create']);
    modalCtrlSpy.create.and.callFake(async () => ({
      present: jasmine.createSpy('present').and.resolveTo(undefined),
    }) as never);

    await TestBed.configureTestingModule({
      imports: [SettingsPage],
      providers: [{ provide: ModalController, useValue: modalCtrlSpy }],
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('opens the presign info sheet', async () => {
    await component['openPresignInfo']();

    expect(modalCtrlSpy.create).toHaveBeenCalledWith(jasmine.objectContaining({
      component: InfoSheetComponent,
      componentProps: jasmine.objectContaining({ title: 'Presigned vouchers' }),
      cssClass: 'info-sheet-modal',
    }));
  });

  it('opens the printer info sheet', async () => {
    await component['openPrinterInfo']();

    expect(modalCtrlSpy.create).toHaveBeenCalledWith(jasmine.objectContaining({
      component: InfoSheetComponent,
      componentProps: jasmine.objectContaining({ title: 'Printer (experimental)' }),
      cssClass: 'info-sheet-modal',
    }));
  });

  it('passes headed sections explaining the fork requirement', async () => {
    await component['openPresignInfo']();

    const sections = modalCtrlSpy.create.calls.mostRecent().args[0].componentProps?.['sections'] as { heading?: string; text: string }[];
    expect(sections.length).toBeGreaterThan(1);
    expect(sections.some((s) => s.text.includes('feature/pin_presign'))).toBeTrue();
  });

  it('marks the info as seen when opened manually', async () => {
    await component['openPresignInfo']();
    await component['openPrinterInfo']();

    expect(localStorage.getItem('boltTap.presignInfoSeen')).toBe('1');
    expect(localStorage.getItem('boltTap.printerInfoSeen')).toBe('1');
  });

  it('shows the presign sheet automatically the first time presign is enabled', () => {
    component['onPresignToggle']({ detail: { checked: true } } as CustomEvent);

    expect(modalCtrlSpy.create).toHaveBeenCalledWith(jasmine.objectContaining({
      component: InfoSheetComponent,
      componentProps: jasmine.objectContaining({ title: 'Presigned vouchers' }),
    }));
  });

  it('does not re-show the presign sheet once the info was seen', () => {
    localStorage.setItem('boltTap.presignInfoSeen', '1');

    component['onPresignToggle']({ detail: { checked: true } } as CustomEvent);

    expect(modalCtrlSpy.create).not.toHaveBeenCalled();
  });

  it('does not show the presign sheet when disabling', () => {
    component['onPresignToggle']({ detail: { checked: false } } as CustomEvent);

    expect(modalCtrlSpy.create).not.toHaveBeenCalled();
  });
});
