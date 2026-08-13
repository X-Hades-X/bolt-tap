import {Component, inject} from '@angular/core';
import {Capacitor} from '@capacitor/core';
import {NfcService} from '../../../../../services/nfc.service';
import {IonButton} from '@ionic/angular/standalone';

@Component({
  selector: 'app-nfc-scanner',
  templateUrl: './nfc-scanner.component.html',
  styleUrls: ['./nfc-scanner.component.scss'],
  standalone: true,
  imports: [IonButton],
})
export class NfcScannerComponent {
  private readonly _nfcService = inject(NfcService);

  nfcEnabled = false;
  isIos = false;

  constructor() {
    this.isIos = Capacitor.getPlatform() === 'ios';
    if (!this.isIos) {
      this.nfcEnabled = true;
      this.startScan();
    }
  }

  grantNfcPermission() {
    if (this.isIos) {
      void this._nfcService.enableNfc$().then((enabled) => {
        // Only flip the UI on real success — enableNfc$ resolves false when
        // the scan session failed to start (e.g. permission denied).
        if (enabled) {
          this.nfcEnabled = true;
          this.startScan();
        }
      });
    }
  }

  startScan() {
    this._nfcService.startScan();
  }

}
