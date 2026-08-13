import {Component, inject} from '@angular/core';
import {Router} from "@angular/router";
import {LnurlService} from "../../../services/lnurl.service";
import {CapacitorBarcodeScanner, CapacitorBarcodeScannerTypeHint} from "@capacitor/barcode-scanner";
import {
  IonIcon,
  IonLabel,
  IonTabBar,
  IonTabButton,
  IonTabs
} from "@ionic/angular/standalone";
import {addIcons} from "ionicons";
import {cameraOutline, settingsOutline, walletOutline} from "ionicons/icons";

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.component.html',
  styleUrls: ['tabs.component.scss'],
  standalone: true,
  host: { class: 'ion-page' },
  imports: [
    IonTabs,
    IonTabBar,
    IonTabButton,
    IonIcon,
    IonLabel,
  ],
})
export class TabsPage {
  private readonly _router = inject(Router);
  private readonly _lnurlService = inject(LnurlService);

  constructor() {
    addIcons({walletOutline, cameraOutline, settingsOutline});
  }

  startScan(event: Event) {
    // Prevent default tab button behavior since this is an action button, not a navigation tab
    event.stopPropagation();
    event.preventDefault();

    CapacitorBarcodeScanner.scanBarcode({
      hint: CapacitorBarcodeScannerTypeHint.QR_CODE
    }).then((scan) => {
      if (scan.ScanResult.length > 0) {
        try {
          const parsed = this._lnurlService.parseLnurl(scan.ScanResult);
          // Invoices navigate themselves to the invoice page inside parseLnurl.
          if (parsed === 'lnurl') {
            void this._router.navigate(['/tabs/wallet/details']);
          }
        } catch {
          void this._router.navigate(['/tabs/wallet']);
        }
      } else {
        void this._router.navigate(['/tabs/wallet']);
      }
    }, () => {
      void this._router.navigate(['/tabs/wallet']);
    });
  }
}
