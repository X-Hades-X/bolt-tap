import {bootstrapApplication} from '@angular/platform-browser';
import {RouteReuseStrategy, provideRouter, withPreloading, PreloadAllModules} from '@angular/router';
import {IonicRouteStrategy, provideIonicAngular} from '@ionic/angular/standalone';
import {provideHttpClient} from '@angular/common/http';
import {ErrorHandler} from '@angular/core';

import {AppComponent} from './app/app.component';
import {APP_ROUTES} from './app/app.routes';
import {GlobalErrorHandler} from './services/global-error-handler';

bootstrapApplication(AppComponent, {
  providers: [
    {provide: RouteReuseStrategy, useClass: IonicRouteStrategy},
    {provide: ErrorHandler, useClass: GlobalErrorHandler},
    provideIonicAngular(),
    provideRouter(APP_ROUTES, withPreloading(PreloadAllModules)),
    provideHttpClient(),
  ],
}).catch((err) => console.error(err));
