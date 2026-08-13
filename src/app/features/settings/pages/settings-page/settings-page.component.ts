import {Component, inject} from '@angular/core';
import {environment} from '../../../../../environments/environment';
import {SettingsService} from '../../../../../services/settings.service';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonTitle,
  IonToggle,
  IonToolbar,
  ModalController
} from '@ionic/angular/standalone';
import {PrintPreviewComponent} from '../../../../shared/components/print-preview/print-preview.component';
import {InfoSheetComponent} from '../../../../shared/components/info-sheet/info-sheet.component';
import {InfoSheetContent, PRESIGN_INFO, PRINTER_INFO} from '../../../../shared/components/info-sheet/info-sheet.presets';
import {addIcons} from 'ionicons';
import {documentOutline, flashOutline, informationCircleOutline} from 'ionicons/icons';

@Component({
  selector: 'app-settings',
  templateUrl: 'settings-page.component.html',
  styleUrls: ['settings-page.component.scss'],
  standalone: true,
  host: { class: 'ion-page' },
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonList,
    IonItem,
    IonIcon,
    IonLabel,
    IonToggle,
    IonButton,
    PrintPreviewComponent,
  ],
})
export class SettingsPage {
  private readonly _settings = inject(SettingsService);
  private readonly _modalCtrl = inject(ModalController);

  /** False in the printer-less ("noble") build variant. */
  protected readonly printerEnabled = environment.printer;

  /** Presigned-voucher probe on Send — opt-in fork backend extension. */
  protected get presignEnabled(): boolean {
    return this._settings.presignEnabled;
  }

  constructor() {
    addIcons({documentOutline, flashOutline, informationCircleOutline});
  }

  /** First activation forces the explanation sheet once (it is a bearer-
   * instrument feature on a custom backend — nobody should enable it blind). */
  protected onPresignToggle(event: CustomEvent) {
    const enabled = event.detail.checked === true;
    this._settings.setPresignEnabled(enabled);
    if (enabled && !this._settings.presignInfoSeen) {
      void this.openPresignInfo();
    }
  }

  protected async openPresignInfo() {
    this._settings.markPresignInfoSeen();
    await this.openInfoSheet(PRESIGN_INFO);
  }

  protected async openPrinterInfo() {
    this._settings.markPrinterInfoSeen();
    await this.openInfoSheet(PRINTER_INFO);
  }

  private async openInfoSheet(content: InfoSheetContent) {
    const modal = await this._modalCtrl.create({
      component: InfoSheetComponent,
      componentProps: content,
      cssClass: 'info-sheet-modal',
    });
    await modal.present();
  }
}
