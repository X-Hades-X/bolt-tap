import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { ModalController } from '@ionic/angular/standalone';

import { PrintPreviewComponent } from './print-preview.component';
import { BleService } from '../../../../services/ble.service';
import { SettingsService } from '../../../../services/settings.service';
import { InfoSheetComponent } from '../info-sheet/info-sheet.component';

describe('PrintPreviewPage', () => {
  let component: PrintPreviewComponent;
  let fixture: ComponentFixture<PrintPreviewComponent>;
  let bleService: jasmine.SpyObj<BleService>;
  let settingsMock: { printerInfoSeen: boolean; markPrinterInfoSeen: jasmine.Spy };

  let modalCreateSpy: jasmine.Spy;
  let capturedConfigs: any[];

  /** Makes every created sheet resolve onWillDismiss with the given role. */
  function mockSheets(role: string) {
    modalCreateSpy.and.callFake(async (config: any) => {
      capturedConfigs.push(config);
      return {
        present: jasmine.createSpy('present').and.resolveTo(undefined),
        onWillDismiss: jasmine.createSpy('onWillDismiss').and.resolveTo({ role }),
      };
    });
  }

  beforeEach(waitForAsync(() => {
    bleService = jasmine.createSpyObj<BleService>('BleService', ['initialize', 'scanDevices', 'connect', 'print']);
    settingsMock = { printerInfoSeen: true, markPrinterInfoSeen: jasmine.createSpy('markPrinterInfoSeen') };

    modalCreateSpy = jasmine.createSpy('create');
    capturedConfigs = [];
    mockSheets('cancel');

    TestBed.configureTestingModule({
      imports: [PrintPreviewComponent],
      providers: [
        { provide: BleService, useValue: bleService },
        { provide: ModalController, useValue: { create: modalCreateSpy } },
        { provide: SettingsService, useValue: settingsMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PrintPreviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  function mockSuccessfulScan() {
    bleService.initialize.and.resolveTo();
    bleService.scanDevices.and.resolveTo({ deviceId: 'p1', name: 'Niimbot1' } as never);
    bleService.connect.and.resolveTo({} as never);
  }

  /** The label build includes a template Image load, which zone.js does not
   * track — poll briefly until the print call lands (local asset, fails or
   * loads fast). */
  async function waitForPrintCall() {
    for (let i = 0; i < 50 && bleService.print.calls.count() === 0; i++) {
      await new Promise((r) => setTimeout(r, 20));
    }
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('connects directly to the picked device (no second selection prompt)', async () => {
    mockSuccessfulScan();

    await component.scan();

    expect(component.connectionState).toBe('connected');
    expect(component.connectedDeviceName).toBe('Niimbot1');
    expect(component.errorMessage).toBeNull();
  });

  it('shows the reason when scanning fails', async () => {
    bleService.initialize.and.resolveTo();
    bleService.scanDevices.and.rejectWith(new Error('Bluetooth is off'));

    await component.scan();

    expect(component.connectionState).toBe('error');
    expect(component.errorMessage).toBe('Bluetooth is off');
  });

  it('shows the reason when connecting fails', async () => {
    bleService.initialize.and.resolveTo();
    bleService.scanDevices.and.resolveTo({ deviceId: 'p1', name: 'Niimbot1' } as never);
    bleService.connect.and.rejectWith(new Error('GATT timeout'));

    await component.scan();

    expect(component.connectionState).toBe('error');
    expect(component.errorMessage).toBe('Connection error: GATT timeout');
  });

  it('renders the error message in the template', async () => {
    bleService.initialize.and.resolveTo();
    bleService.scanDevices.and.rejectWith(new Error('Bluetooth is off'));

    await component.scan();
    fixture.detectChanges();

    const errorEl: HTMLElement | null = fixture.nativeElement.querySelector('.printer-error');
    expect(errorEl?.textContent).toContain('Bluetooth is off');
  });

  describe('first-time printer info', () => {
    it('shows the explanation sheet before the first scan, then proceeds', async () => {
      settingsMock.printerInfoSeen = false;
      mockSuccessfulScan();

      await component.scan();

      expect(settingsMock.markPrinterInfoSeen).toHaveBeenCalled();
      expect(capturedConfigs[0]?.componentProps?.title).toBe('Printer (experimental)');
      // After dismissing the info, the scan/connect flow proceeds normally.
      expect(capturedConfigs[1]?.componentProps?.title).toBe('Printer connected');
      expect(component.connectionState).toBe('connected');
    });

    it('goes straight to scanning once the info was seen', async () => {
      mockSuccessfulScan();

      await component.scan();

      expect(capturedConfigs.some((c) => c.componentProps?.title === 'Printer (experimental)')).toBeFalse();
    });
  });

  describe('test print after connect (empty-first-label quirk)', () => {
    it('asks for a test print after a successful connect', async () => {
      mockSuccessfulScan();

      await component.scan();

      expect(modalCreateSpy).toHaveBeenCalledWith(jasmine.objectContaining({
        component: InfoSheetComponent,
        componentProps: jasmine.objectContaining({ title: 'Printer connected' }),
      }));
    });

    it('does not print when the prompt is skipped', async () => {
      mockSuccessfulScan();

      await component.scan();

      expect(bleService.print).not.toHaveBeenCalled();
      expect(component.connectionState).toBe('connected');
    });

    it('primes the printer with a label-shaped test print when confirmed', async () => {
      mockSuccessfulScan();
      bleService.print.and.resolveTo();
      mockSheets('confirm');

      await component.scan();
      await waitForPrintCall();
      await fixture.whenStable();

      const canvas = bleService.print.calls.mostRecent().args[0] as HTMLCanvasElement;
      expect(canvas).toEqual(jasmine.any(HTMLCanvasElement));
      // Same geometry as a real label — anything else can wedge the next job.
      expect(canvas.width).toBe(384);
      expect(canvas.height).toBe(384);
      expect(bleService.print).toHaveBeenCalledTimes(1);
      expect(component.connectionState).toBe('connected');
      expect(component.errorMessage).toBeNull();
    });

    it('stays connected and shows the error when the test print fails', async () => {
      mockSuccessfulScan();
      bleService.print.and.rejectWith(new Error('out of paper'));
      mockSheets('confirm');

      await component.scan();
      await waitForPrintCall();
      await fixture.whenStable();

      // The printer is still connected — only the test print failed.
      expect(component.connectionState).toBe('connected');
      expect(component.errorMessage).toBe('Test print failed: out of paper');
    });

    it('does not ask again after a failed scan', async () => {
      bleService.initialize.and.resolveTo();
      bleService.scanDevices.and.rejectWith(new Error('Bluetooth is off'));

      await component.scan();

      expect(modalCreateSpy).not.toHaveBeenCalled();
    });
  });
});
