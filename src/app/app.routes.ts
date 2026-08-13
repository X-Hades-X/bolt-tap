import {Routes} from '@angular/router';

export const APP_ROUTES: Routes = [
  {
    path: 'tabs',
    loadComponent: () => import('./layout/tabs/tabs.component').then(m => m.TabsPage),
    children: [
      {
        path: 'wallet',
        children: [
          {
            path: '',
            loadComponent: () => import('./features/wallet/pages/wallet-page/wallet-page.component').then(m => m.WalletPage),
          },
        ],
      },
      {
        path: 'wallet/details',
        children: [
          {
            path: '',
            loadComponent: () => import('./features/wallet/pages/wallet-details-page/wallet-details-page.component').then(m => m.WalletDetailsPage),
          },
        ],
      },
      {
        path: 'wallet/amount',
        children: [
          {
            path: '',
            loadComponent: () => import('./features/wallet/pages/amount-page/amount-page.component').then(m => m.AmountPage),
          },
        ],
      },
      {
        path: 'wallet/invoice',
        children: [
          {
            path: '',
            loadComponent: () => import('./features/wallet/pages/invoice-page/invoice-page.component').then(m => m.InvoicePage),
          },
        ],
      },
      {
        path: 'settings',
        children: [
          {
            path: '',
            loadComponent: () => import('./features/settings/pages/settings-page/settings-page.component').then(m => m.SettingsPage),
          },
        ],
      },
      {
        path: '',
        redirectTo: 'wallet',
        pathMatch: 'full',
      },
    ],
  },
  {
    path: '',
    redirectTo: '/tabs/wallet',
    pathMatch: 'full',
  },
];
