import {TestBed} from '@angular/core/testing';
import {provideRouter, Router} from '@angular/router';
import {Capacitor} from '@capacitor/core';

import {DeepLinkService} from './deep-link.service';
import {LnurlService} from './lnurl.service';

describe('DeepLinkService', () => {
  let service: DeepLinkService;
  let lnurlService: {parseLnurl: jasmine.Spy};
  let router: Router;

  const LNURLW = 'lnurlw://example.com/withdraw';

  /** Typed view of the protected wrapper seams so Jasmine spies typecheck. */
  type Seams = {
    registerUrlListener: () => Promise<void>;
    readLaunchUrl: () => Promise<string | undefined>;
  };
  const seams = () => service as unknown as Seams;

  beforeEach(() => {
    lnurlService = {parseLnurl: jasmine.createSpy('parseLnurl').and.returnValue('lnurl')};

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {provide: LnurlService, useValue: lnurlService},
      ]
    });

    router = TestBed.inject(Router);
    spyOn(router, 'navigate');
    service = TestBed.inject(DeepLinkService);
  });

  describe('init', () => {
    it('does nothing on web', async () => {
      // Karma runs as platform 'web' — no spy on isNativePlatform needed.
      const registerSpy = spyOn(seams(), 'registerUrlListener');
      const launchSpy = spyOn(seams(), 'readLaunchUrl');

      await service.init();

      expect(registerSpy).not.toHaveBeenCalled();
      expect(launchSpy).not.toHaveBeenCalled();
    });

    it('registers the appUrlOpen listener and handles the launch URL on native', async () => {
      spyOn(Capacitor, 'isNativePlatform').and.returnValue(true);
      const registerSpy = spyOn(seams(), 'registerUrlListener').and.resolveTo(undefined);
      spyOn(seams(), 'readLaunchUrl').and.resolveTo(LNURLW);

      await service.init();

      expect(registerSpy).toHaveBeenCalledOnceWith();
      expect(lnurlService.parseLnurl).toHaveBeenCalledOnceWith(LNURLW);
      expect(router.navigate).toHaveBeenCalledOnceWith(['/tabs/wallet/details']);
    });

    it('runs only once', async () => {
      spyOn(Capacitor, 'isNativePlatform').and.returnValue(true);
      const registerSpy = spyOn(seams(), 'registerUrlListener').and.resolveTo(undefined);
      spyOn(seams(), 'readLaunchUrl').and.resolveTo(undefined);

      await service.init();
      await service.init();

      expect(registerSpy).toHaveBeenCalledOnceWith();
    });
  });

  describe('handleDeepLink', () => {
    it('navigates to the details page for lnurls', () => {
      service.handleDeepLink(LNURLW);

      expect(lnurlService.parseLnurl).toHaveBeenCalledOnceWith(LNURLW);
      expect(router.navigate).toHaveBeenCalledOnceWith(['/tabs/wallet/details']);
    });

    it('does not navigate for invoices (parseLnurl navigates them itself)', () => {
      lnurlService.parseLnurl.and.returnValue('invoice');

      service.handleDeepLink('lightning:lnbc1000n1p0test');

      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('dedupes the same URL within the dedup window', () => {
      // Cold start via ACTION_VIEW: retained appUrlOpen replay + getLaunchUrl
      // deliver the same URL — only the first may be handled.
      service.handleDeepLink(LNURLW);
      service.handleDeepLink(LNURLW);

      expect(lnurlService.parseLnurl).toHaveBeenCalledOnceWith(LNURLW);
    });

    it('handles different URLs independently', () => {
      service.handleDeepLink(LNURLW);
      service.handleDeepLink('lnurlp://example.com/pay');

      expect(lnurlService.parseLnurl).toHaveBeenCalledTimes(2);
    });

    it('ignores unparseable links without navigating', () => {
      lnurlService.parseLnurl.and.throwError('Could not parse data as known LNURL format.');

      expect(() => service.handleDeepLink('https://example.com/random')).not.toThrow();
      expect(router.navigate).not.toHaveBeenCalled();
    });
  });
});
