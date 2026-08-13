import {Component, inject, OnInit} from '@angular/core';
import {IonApp, IonRouterOutlet, Platform} from '@ionic/angular/standalone';
import {DeepLinkService} from '../services/deep-link.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: true,
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent implements OnInit {
  private readonly _platform = inject(Platform);
  private readonly _deepLinkService = inject(DeepLinkService);

  constructor() {}

  ngOnInit() {
    // Wait for the platform so the router outlet exists before a deep link
    // (Bolt Card tap / lnurl link that launched or foregrounded the app)
    // navigates.
    void this._platform.ready().then(() => this._deepLinkService.init());
  }
}
