import {Component, inject} from '@angular/core';
import {BleDevice} from '@capacitor-community/bluetooth-le';
import {BleService} from '../../../../services/ble.service';
import {SettingsService} from '../../../../services/settings.service';
import {IonButton, IonSpinner, ModalController} from '@ionic/angular/standalone';
import {InfoSheetComponent} from '../info-sheet/info-sheet.component';
import {PRINTER_INFO} from '../info-sheet/info-sheet.presets';
import {buildLabelCanvas} from '../../utils/print-canvas';

export type ConnectionState = 'idle' | 'scanning' | 'connecting' | 'connected' | 'priming' | 'error';

@Component({
  selector: 'app-print-preview-page',
  templateUrl: './print-preview.component.html',
  styleUrls: ['./print-preview.component.scss'],
  standalone: true,
  imports: [
    IonButton,
    IonSpinner,
  ],
})
export class PrintPreviewComponent {
  private readonly blePrinter = inject(BleService);
  private readonly modalCtrl = inject(ModalController);
  private readonly settings = inject(SettingsService);

  connectionState: ConnectionState = 'idle';
  connectedDeviceName: string | null = null;
  errorMessage: string | null = null;

  get isBusy(): boolean {
    return this.connectionState === 'scanning'
      || this.connectionState === 'connecting'
      || this.connectionState === 'priming';
  }

  get buttonText(): string {
    switch (this.connectionState) {
      case 'scanning':
        return 'Scanning...';
      case 'connecting':
        return 'Connecting...';
      case 'priming':
        return 'Printing test...';
      case 'connected':
        return this.connectedDeviceName ?? 'Connected';
      default:
        return 'Connect';
    }
  }

  async scan() {
    if (this.isBusy) return;

    // First-ever connect: force the experimental-printer explanation once
    // before touching Bluetooth, then proceed on dismiss.
    if (!this.settings.printerInfoSeen) {
      await this.showPrinterInfo();
    }

    this.connectionState = 'scanning';
    this.errorMessage = null;

    try {
      await this.blePrinter.initialize();
      const device = await this.blePrinter.scanDevices();
      // The OS device picker (requestDevice) already made the user choose —
      // don't ask again, just connect to that device.
      await this.connect(device);
    } catch (err) {
      this.connectionState = 'error';
      this.errorMessage = err instanceof Error ? err.message : 'Failed to scan for printers.';
    }
  }

  private async connect(device: BleDevice) {
    this.connectionState = 'connecting';

    try {
      await this.blePrinter.connect(device.deviceId);
      this.connectionState = 'connected';
      this.connectedDeviceName = device.name ?? 'Unnamed';
      await this.promptTestPrint();
    } catch (err) {
      this.connectionState = 'error';
      this.errorMessage = 'Connection error: ' + (err instanceof Error ? err.message : 'unknown');
    }
  }

  /** Shows the experimental-printer explanation and marks it seen. */
  private async showPrinterInfo() {
    this.settings.markPrinterInfoSeen();
    const modal = await this.modalCtrl.create({
      component: InfoSheetComponent,
      componentProps: PRINTER_INFO,
      cssClass: 'info-sheet-modal',
    });
    await modal.present();
    await modal.onWillDismiss();
  }

  /** The printer quirk: the first job after every connect comes out empty.
   * Offer to absorb it with a throwaway test print so the first real label
   * prints correctly. */
  private async promptTestPrint() {
    const modal = await this.modalCtrl.create({
      component: InfoSheetComponent,
      componentProps: {
        title: 'Printer connected',
        sections: [{text: 'The first print after connecting always comes out empty (printer quirk). Print a test label now so your actual label prints on the first try?'}],
        buttons: [
          {text: 'Skip', role: 'cancel', style: 'ghost'},
          {text: 'Print test label', role: 'confirm'},
        ],
      },
      cssClass: 'info-sheet-modal',
    });
    await modal.present();

    const {role} = await modal.onWillDismiss();
    if (role === 'confirm') {
      void this.primePrinter();
    }
  }

  /** Sends the throwaway test print that absorbs the empty-first-label bug.
   * It is the exact same label as a real print, except the QR encodes the
   * text "test" — a job shaped differently from real labels can wedge the
   * printer's next job. */
  private async primePrinter() {
    this.connectionState = 'priming';
    this.errorMessage = null;

    try {
      await this.blePrinter.print(await buildLabelCanvas('test'));
      this.connectionState = 'connected';
    } catch (err) {
      // The printer itself is still connected — only the test print failed.
      this.connectionState = 'connected';
      this.errorMessage = 'Test print failed: ' + (err instanceof Error ? err.message : 'unknown');
    }
  }
}
