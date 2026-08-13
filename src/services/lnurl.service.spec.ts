import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter, Router } from '@angular/router';
import { LnurlService } from './lnurl.service';
import { SettingsService } from './settings.service';
import {
  PayRequestData,
  PayResponseData,
  WithdrawRequestData,
  WithdrawResponseData,
  PresignedLnurl
} from '../model/lnurl.model';
import { firstValueFrom } from 'rxjs';

describe('LnurlService', () => {
  let service: LnurlService;
  let httpMock: HttpTestingController;
  let router: Router;
  // Most tests exercise presign behavior; flip to false per-test as needed.
  let settingsMock: { presignEnabled: boolean };

  beforeEach(() => {
    settingsMock = {presignEnabled: true};

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {provide: SettingsService, useValue: settingsMock}
      ]
    });
    service = TestBed.inject(LnurlService);
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    spyOn(router, 'navigate');
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('State Management', () => {
    it('should initialize with undefined observables', (done) => {
      service.lnurlWithdraw$.subscribe(value => {
        expect(value).toBeUndefined();
        done();
      });
    });

    it('should reset all data', (done) => {
      const mockWithdrawData: WithdrawRequestData = {
        tag: 'withdrawRequest',
        callback: 'https://example.com/callback',
        k1: 'test-k1',
        minWithdrawable: 1000,
        maxWithdrawable: 10000
      };

      service.setInvoice(mockWithdrawData);

      service.resetAllData();

      Promise.all([
        firstValueFrom(service.lnurlWithdraw$),
        firstValueFrom(service.lnurlPay$),
        firstValueFrom(service.lnurlInvoice$),
        firstValueFrom(service.invoiceInvoice$)
      ]).then(([withdraw, pay, invoice, invoiceInvoice]) => {
        expect(withdraw).toBeUndefined();
        expect(pay).toBeUndefined();
        expect(invoice).toBeUndefined();
        expect(invoiceInvoice).toBeUndefined();
        done();
      });
    });

    it('should set invoice data', (done) => {
      const mockPayData: PayRequestData = {
        tag: 'payRequest',
        callback: 'https://example.com/callback',
        minSendable: 1000,
        maxSendable: 10000
      };

      service.setInvoice(mockPayData);

      service.lnurlInvoice$.subscribe(value => {
        if (value) {
          expect(value).toEqual(mockPayData);
          done();
        }
      });
    });
  });

  describe('parseLnurl', () => {
    it('should parse Lightning address (user@domain)', () => {
      const mockPayData: PayRequestData = {
        tag: 'payRequest',
        callback: 'https://example.com/callback',
        minSendable: 1000,
        maxSendable: 10000
      };

      service.parseLnurl('satoshi@bitcoin.org');

      const req = httpMock.expectOne('https://bitcoin.org/.well-known/lnurlp/satoshi');
      expect(req.request.method).toBe('GET');
      req.flush(mockPayData);
    });

    it('should parse HTTPS URL directly', () => {
      const mockPayData: PayRequestData = {
        tag: 'payRequest',
        callback: 'https://example.com/callback',
        minSendable: 1000,
        maxSendable: 10000
      };

      service.parseLnurl('https://example.com/lnurl');

      const req = httpMock.expectOne('https://example.com/lnurl');
      expect(req.request.method).toBe('GET');
      req.flush(mockPayData);
    });

    it('should parse lnurlw:// scheme', () => {
      const mockWithdrawData: WithdrawRequestData = {
        tag: 'withdrawRequest',
        callback: 'https://example.com/callback',
        k1: 'test-k1',
        minWithdrawable: 1000,
        maxWithdrawable: 10000
      };

      service.parseLnurl('lnurlw://example.com/withdraw');

      const req = httpMock.expectOne('https://example.com/withdraw');
      expect(req.request.method).toBe('GET');
      req.flush(mockWithdrawData);
    });

    it('should parse lnurlp:// scheme', () => {
      const mockPayData: PayRequestData = {
        tag: 'payRequest',
        callback: 'https://example.com/callback',
        minSendable: 1000,
        maxSendable: 10000
      };

      service.parseLnurl('lnurlp://example.com/pay');

      const req = httpMock.expectOne('https://example.com/pay');
      expect(req.request.method).toBe('GET');
      req.flush(mockPayData);
    });

    it('should extract and navigate to invoice from lnbc string', () => {
      service.parseLnurl('lightning:lnbc1000n1p0test');

      expect(router.navigate).toHaveBeenCalledWith(['tabs/wallet/invoice']);
    });

    it('should set invoice subject when parsing lnbc', (done) => {
      service.parseLnurl('prefix-lnbc1000n1p0test-suffix');

      service.invoiceInvoice$.subscribe(value => {
        if (value && 'pr' in value) {
          expect(value.pr).toBe('lnbc1000n1p0test-suffix');
          done();
        }
      });
    });

    it('should throw error for invalid format', () => {
      expect(() => service.parseLnurl('invalid-data-format'))
        .toThrowError('Could not parse data as known LNURL format.');
    });

    it('should trim surrounding whitespace from pasted input', (done) => {
      service.parseLnurl('  lnbc1000n1p0test  \n');

      service.invoiceInvoice$.subscribe(value => {
        if (value && 'pr' in value) {
          expect(value.pr).toBe('lnbc1000n1p0test');
          done();
        }
      });
    });

    it('should return invoice for lnbc input so callers do not navigate away', () => {
      expect(service.parseLnurl('lnbc1000n1p0test')).toBe('invoice');
    });

    it('should return lnurl for lnurlw input', () => {
      const mockData: WithdrawRequestData = {
        tag: 'withdrawRequest',
        callback: 'https://example.com/callback',
        k1: 'k1',
        minWithdrawable: 1000,
        maxWithdrawable: 10000
      };

      expect(service.parseLnurl('lnurlw://example.com/withdraw')).toBe('lnurl');

      const req = httpMock.expectOne('https://example.com/withdraw');
      req.flush(mockData);
    });

    it('should route invoices containing the substring lnurl to the invoice page', () => {
      // bolt11 bech32 data can legally contain 'lnurl'; it must not be
      // misrouted into the LNURL bech32 decoder.
      service.parseLnurl('lightning:lnbc1000n1p0lnurltest');

      expect(router.navigate).toHaveBeenCalledWith(['tabs/wallet/invoice']);
    });

    it('should decode bech32-encoded LNURL', () => {
      // This is a real bech32-encoded LNURL for https://service.com/api
      const bech32Lnurl = 'lnurl1dp68gurn8ghj7um9wfmxjcm99e3k7mf0v9cxj0m385ekvcenxc6r2c35xvukxefcv5mkvv34x5ekzd3ev56nyd3hxqurzepexejxxepnxscrvwfnv9nxzcn9xq6xyefhvgcxxcmyxymnserxfq5fns';

      const mockPayData: PayRequestData = {
        tag: 'payRequest',
        callback: 'https://example.com/callback',
        minSendable: 1000,
        maxSendable: 10000
      };

      service.parseLnurl(bech32Lnurl);

      // The decoded URL should be requested
      const req = httpMock.expectOne(req => req.url.startsWith('https://'));
      expect(req.request.url).toContain('service.com');
      req.flush(mockPayData);
    });
  });

  describe('resolveLnurl', () => {
    it('should convert lnurlw:// to https:// GET request', (done) => {
      const mockData: WithdrawRequestData = {
        tag: 'withdrawRequest',
        callback: 'https://example.com/callback',
        k1: 'test-k1',
        minWithdrawable: 1000,
        maxWithdrawable: 10000
      };

      service.getLnurlData('lnurlw://example.com/withdraw').subscribe(data => {
        expect(data).toEqual(mockData);
        done();
      });

      const req = httpMock.expectOne('https://example.com/withdraw');
      expect(req.request.method).toBe('GET');
      req.flush(mockData);
    });

    it('should convert lnurlp:// to https:// GET request', (done) => {
      const mockData: PayRequestData = {
        tag: 'payRequest',
        callback: 'https://example.com/callback',
        minSendable: 1000,
        maxSendable: 10000
      };

      service.getLnurlData('lnurlp://example.com/pay').subscribe(data => {
        expect(data).toEqual(mockData);
        done();
      });

      const req = httpMock.expectOne('https://example.com/pay');
      expect(req.request.method).toBe('GET');
      req.flush(mockData);
    });

    it('should handle direct https URLs', (done) => {
      const mockData: PayRequestData = {
        tag: 'payRequest',
        callback: 'https://example.com/callback',
        minSendable: 1000,
        maxSendable: 10000
      };

      service.getLnurlData('https://example.com/lnurl').subscribe(data => {
        expect(data).toEqual(mockData);
        done();
      });

      const req = httpMock.expectOne('https://example.com/lnurl');
      req.flush(mockData);
    });

    it('should emit an error for unsupported URL scheme without leaking the raw link', (done) => {
      service.getLnurlData('ftp://example.com/withdraw?k1=secret').subscribe({
        next: () => fail('should not emit a value'),
        error: (err) => {
          expect(err.message).toBe('Cannot parse LNURL link.');
          expect(err.message).not.toContain('secret');
          done();
        }
      });
    });

    it('should accept uppercase lnurlw:// scheme', (done) => {
      const mockData: WithdrawRequestData = {
        tag: 'withdrawRequest',
        callback: 'https://example.com/callback',
        k1: 'test-k1',
        minWithdrawable: 1000,
        maxWithdrawable: 10000
      };

      service.getLnurlData('LNURLW://example.com/withdraw').subscribe(data => {
        expect(data).toEqual(mockData);
        done();
      });

      const req = httpMock.expectOne('https://example.com/withdraw');
      expect(req.request.method).toBe('GET');
      req.flush(mockData);
    });
  });

  describe('fetchInvoice', () => {
    it('should fetch withdraw request with amount', (done) => {
      const withdrawData: WithdrawRequestData = {
        tag: 'withdrawRequest',
        callback: 'https://example.com/callback',
        k1: 'test-k1',
        minWithdrawable: 1000,
        maxWithdrawable: 10000
      };

      const mockResponse: PresignedLnurl = {
        lnurl: 'lnurlw://example.com/withdraw',
        status: 'OK'
      };

      service.fetchInvoice(withdrawData, undefined, 5000).subscribe();

      service.invoiceInvoice$.subscribe(value => {
        if (value && 'lnurl' in value) {
          expect(value).toEqual(mockResponse);
          done();
        }
      });

      const req = httpMock.expectOne(req =>
        req.url === 'https://example.com/callback' &&
        req.params.get('k1') === 'test-k1' &&
        req.params.get('amount') === '5000000' // 5000 sats = 5 000 000 msat (LNURLcash denomination)
      );
      req.flush(mockResponse);
    });

    it('should fetch pay request with amount', (done) => {
      const payData: PayRequestData = {
        tag: 'payRequest',
        callback: 'https://example.com/callback',
        minSendable: 1000,
        maxSendable: 10000
      };

      const mockResponse: PayResponseData = {
        pr: 'lnbc5000n1p0test'
      };

      service.fetchInvoice(payData, undefined, 5).subscribe();

      service.invoiceInvoice$.subscribe(value => {
        if (value && 'pr' in value) {
          expect(value).toEqual(mockResponse);
          done();
        }
      });

      const req = httpMock.expectOne(req =>
        req.url === 'https://example.com/callback' &&
        req.params.get('amount') === '5000'
      );
      req.flush(mockResponse);
    });

    it('should throw error for pay request without amount', () => {
      const payData: PayRequestData = {
        tag: 'payRequest',
        callback: 'https://example.com/callback',
        minSendable: 1000,
        maxSendable: 10000
      };

      expect(() => service.fetchInvoice(payData))
        .toThrowError('Amount is mandatory for payRequest.');
    });

    it('should throw error for withdraw request without amount or payRequest', () => {
      const withdrawData: WithdrawRequestData = {
        tag: 'withdrawRequest',
        callback: 'https://example.com/callback',
        k1: 'test-k1',
        minWithdrawable: 1000,
        maxWithdrawable: 10000
      };

      expect(() => service.fetchInvoice(withdrawData))
        .toThrowError('Amount or payRequest (one of) must be set for withdrawRequest.');
    });

    it('should include pin in withdraw request params', () => {
      const withdrawData: WithdrawRequestData = {
        tag: 'withdrawRequest',
        callback: 'https://example.com/callback',
        k1: 'test-k1',
        minWithdrawable: 1000,
        maxWithdrawable: 10000
      };

      const mockResponse: PresignedLnurl = {
        lnurl: 'lnurlw://example.com/withdraw',
        status: 'OK'
      };

      service.fetchInvoice(withdrawData, undefined, 5000, '1234').subscribe();

      const req = httpMock.expectOne(req =>
        req.params.get('pin') === '1234'
      );
      expect(req.request.params.get('pin')).toBe('1234');
      req.flush(mockResponse);
    });

    it('should handle successful response', (done) => {
      const payData: PayRequestData = {
        tag: 'payRequest',
        callback: 'https://example.com/callback',
        minSendable: 1000,
        maxSendable: 10000
      };

      const successResponse: PayResponseData = {
        pr: 'lnbc1000n1p0test'
      };

      service.fetchInvoice(payData, undefined, 5).subscribe();

      service.invoiceInvoice$.subscribe(value => {
        if (value && 'pr' in value) {
          expect(value.pr).toBe('lnbc1000n1p0test');
          done();
        }
      });

      const req = httpMock.expectOne(req => req.url.includes('callback'));
      req.flush(successResponse);
    });

    it('should map error status responses to observable errors with the reason', (done) => {
      const withdrawData: WithdrawRequestData = {
        tag: 'withdrawRequest',
        callback: 'https://example.com/callback',
        k1: 'test-k1',
        minWithdrawable: 1000,
        maxWithdrawable: 10000
      };

      service.fetchInvoice(withdrawData, undefined, 5000, '0000').subscribe({
        next: () => fail('should not emit a value'),
        error: (err) => {
          expect(err.message).toBe('Wrong Pin. 2 tries left.');
          done();
        }
      });

      const req = httpMock.expectOne(req => req.url.includes('callback'));
      req.flush({status: 'ERROR', reason: 'Wrong Pin. 2 tries left.'});
    });

    it('should refuse non-https callbacks on pay requests (k1/PIN must not go plaintext)', (done) => {
      const payData: PayRequestData = {
        tag: 'payRequest',
        callback: 'http://example.com/callback',
        minSendable: 1000,
        maxSendable: 10000
      };

      service.fetchInvoice(payData, undefined, 5).subscribe({
        next: () => fail('should not emit a value'),
        error: (err) => {
          expect(err.message).toBe('Insecure callback URL (https required).');
          expect(httpMock.match(() => true).length).toBe(0);
          done();
        }
      });
    });

    it('should refuse non-https callbacks on withdraw requests', (done) => {
      const withdrawData: WithdrawRequestData = {
        tag: 'withdrawRequest',
        callback: 'http://example.com/callback',
        k1: 'test-k1',
        minWithdrawable: 1000,
        maxWithdrawable: 10000
      };

      service.fetchInvoice(withdrawData, undefined, 5000, '1234').subscribe({
        next: () => fail('should not emit a value'),
        error: (err) => {
          expect(err.message).toBe('Insecure callback URL (https required).');
          expect(httpMock.match(() => true).length).toBe(0);
          done();
        }
      });
    });
  });

  describe('fetchLnurlResponse', () => {
    it('should handle empty array', () => {
      service.fetchLnurlResponse([]);
      // No HTTP requests should be made
      expect(httpMock.match(() => true).length).toBe(0);
    });

    it('should handle array with undefined values', () => {
      service.fetchLnurlResponse([undefined, undefined]);
      // No HTTP requests should be made
      expect(httpMock.match(() => true).length).toBe(0);
    });

    it('should fetch first valid LNURL', () => {
      const mockPayData: PayRequestData = {
        tag: 'payRequest',
        callback: 'https://example.com/callback',
        minSendable: 1000,
        maxSendable: 10000
      };

      // fetchLnurlResponse takes first value in array
      service.fetchLnurlResponse(['lnurlp://example.com/pay', 'lnurlp://other.com']);

      // Should only request the first one
      const req = httpMock.expectOne('https://example.com/pay');
      expect(req.request.url).toBe('https://example.com/pay');
      req.flush(mockPayData);

      // Verify no request to the second URL
      expect(httpMock.match('https://other.com').length).toBe(0);
    });

    it('should navigate to invoice for fixed amount withdraw request', () => {
      const mockWithdrawData: WithdrawRequestData = {
        tag: 'withdrawRequest',
        callback: 'https://example.com/callback',
        k1: 'test-k1',
        minWithdrawable: 5000,
        maxWithdrawable: 5000 // Same as min = fixed amount
      };

      service.fetchLnurlResponse(['lnurlw://example.com/withdraw']);

      const req = httpMock.expectOne('https://example.com/withdraw');
      req.flush(mockWithdrawData);

      expect(router.navigate).toHaveBeenCalledWith(['tabs/wallet/invoice']);
    });

    it('should navigate to invoice for fixed amount pay request', () => {
      const mockPayData: PayRequestData = {
        tag: 'payRequest',
        callback: 'https://example.com/callback',
        minSendable: 1000,
        maxSendable: 1000 // Same as min = fixed amount
      };

      service.fetchLnurlResponse(['lnurlp://example.com/pay']);

      const req = httpMock.expectOne('https://example.com/pay');
      req.flush(mockPayData);

      expect(router.navigate).toHaveBeenCalledWith(['tabs/wallet/invoice']);
    });

    it('should not navigate for variable amount requests', () => {
      const mockPayData: PayRequestData = {
        tag: 'payRequest',
        callback: 'https://example.com/callback',
        minSendable: 1000,
        maxSendable: 10000 // Different = variable amount
      };

      service.fetchLnurlResponse(['lnurlp://example.com/pay']);

      const req = httpMock.expectOne('https://example.com/pay');
      req.flush(mockPayData);

      expect(router.navigate).not.toHaveBeenCalled();
    });
  });

  describe('HTTP Parameter Building', () => {
    it('should multiply amount by 1000 for pay requests (sats to msats)', (done) => {
      const payData: PayRequestData = {
        tag: 'payRequest',
        callback: 'https://example.com/callback',
        minSendable: 1000,
        maxSendable: 10000
      };

      service.fetchInvoice(payData, undefined, 5).subscribe(); // 5 sats

      const req = httpMock.expectOne(req =>
        req.params.get('amount') === '5000' // Should be 5000 msats
      );
      expect(req.request.params.get('amount')).toBe('5000');
      req.flush({ pr: 'lnbc' });
      done();
    });

    it('should build correct withdraw request params with all fields', (done) => {
      const withdrawData: WithdrawRequestData = {
        tag: 'withdrawRequest',
        callback: 'https://example.com/callback',
        k1: 'test-k1-value',
        minWithdrawable: 1000,
        maxWithdrawable: 10000
      };

      service.fetchInvoice(withdrawData, 'lnbc1000n', undefined, '9876')
        .subscribe({error: () => { /* response shape irrelevant for this param test */ }});

      const req = httpMock.expectOne(req => {
        const params = req.params;
        return params.get('k1') === 'test-k1-value' &&
               params.get('pr') === 'lnbc1000n' &&
               params.get('pin') === '9876';
      });
      expect(req.request.params.get('k1')).toBe('test-k1-value');
      expect(req.request.params.get('pr')).toBe('lnbc1000n');
      expect(req.request.params.get('pin')).toBe('9876');
      req.flush({ status: 'OK' });
      done();
    });
  });

  describe('Observable Emissions', () => {
    it('should emit withdraw data to lnurlWithdraw$ observable', (done) => {
      const mockWithdrawData: WithdrawRequestData = {
        tag: 'withdrawRequest',
        callback: 'https://example.com/callback',
        k1: 'test-k1',
        minWithdrawable: 1000,
        maxWithdrawable: 10000
      };

      let emissionCount = 0;
      service.lnurlWithdraw$.subscribe(value => {
        emissionCount++;
        if (emissionCount === 2) { // Skip initial undefined
          expect(value).toEqual(mockWithdrawData);
          done();
        }
      });

      service.fetchLnurlResponse(['lnurlw://example.com/withdraw']);

      const req = httpMock.expectOne('https://example.com/withdraw');
      req.flush(mockWithdrawData);
    });

    it('should emit pay data to lnurlPay$ observable', (done) => {
      const mockPayData: PayRequestData = {
        tag: 'payRequest',
        callback: 'https://example.com/callback',
        minSendable: 1000,
        maxSendable: 10000
      };

      let emissionCount = 0;
      service.lnurlPay$.subscribe(value => {
        emissionCount++;
        if (emissionCount === 2) { // Skip initial undefined
          expect(value).toEqual(mockPayData);
          done();
        }
      });

      service.fetchLnurlResponse(['lnurlp://example.com/pay']);

      const req = httpMock.expectOne('https://example.com/pay');
      req.flush(mockPayData);
    });
  });

  describe('pay() PIN flow (LUD-24)', () => {
    // Valid signed invoice: 250000 msat (250 sats)
    const VALID_INVOICE = 'lnbc2500n1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5w3jhxapqd9h8vmmfvdjsxqrrsscqpfv5rlghu8vkkjys69g8qjr5gz6f2k3f2gfnhjcx3xlgg6hl445e9hymafxq2vn33lr2q56u3zmaf4pvq0wynhun3fjs6uuhgmu403hagqt0vcsy';

    const cardWithdraw: WithdrawRequestData = {
      tag: 'withdrawRequest',
      callback: 'https://example.com/callback',
      k1: 'test-k1',
      minWithdrawable: 1000,
      maxWithdrawable: 1000000
    };

    function tapCardWithInvoiceLoaded(card: WithdrawRequestData) {
      // Simulate: invoice already on screen, then card tap
      service.parseLnurl(VALID_INVOICE);
      service.fetchLnurlResponse(['lnurlw://example.com/card']);
      const req = httpMock.expectOne('https://example.com/card');
      req.flush(card);
    }

    it('should pay immediately when card has no pinLimit', () => {
      tapCardWithInvoiceLoaded({...cardWithdraw});

      const req = httpMock.expectOne(req =>
        req.url === 'https://example.com/callback' &&
        req.params.get('k1') === 'test-k1' &&
        req.params.get('pr') === VALID_INVOICE
      );
      expect(req.request.params.get('pin')).toBeNull();
      req.flush({status: 'OK'});
    });

    it('should pay immediately when amount is below pinLimit', () => {
      // pinLimit 300000 msat > invoice 250000 msat
      tapCardWithInvoiceLoaded({...cardWithdraw, pinLimit: 300000});

      const req = httpMock.expectOne(req => req.url === 'https://example.com/callback');
      expect(req.request.params.get('pin')).toBeNull();
      req.flush({status: 'OK'});
    });

    it('should defer payment and emit pinRequest when amount >= pinLimit', () => {
      // pinLimit 200000 msat <= invoice 250000 msat
      const pinRequests: ({ amountMsat: number } | undefined)[] = [];
      service.pinRequest$.subscribe(v => pinRequests.push(v));

      tapCardWithInvoiceLoaded({...cardWithdraw, pinLimit: 200000});

      // No callback request yet
      expect(httpMock.match(req => req.url === 'https://example.com/callback').length).toBe(0);
      // pinRequest emitted with the invoice amount
      expect(pinRequests[pinRequests.length - 1]).toEqual({amountMsat: 250000});
    });

    it('should fire callback with pin after confirmPin', () => {
      tapCardWithInvoiceLoaded({...cardWithdraw, pinLimit: 200000});

      service.confirmPin('1234');

      const req = httpMock.expectOne(req =>
        req.url === 'https://example.com/callback' &&
        req.params.get('k1') === 'test-k1' &&
        req.params.get('pr') === VALID_INVOICE &&
        req.params.get('pin') === '1234'
      );
      expect(req.request.params.get('pin')).toBe('1234');
      req.flush({status: 'OK'});
    });

    it('should emit paymentStatus after confirmPin payment completes', (done) => {
      tapCardWithInvoiceLoaded({...cardWithdraw, pinLimit: 200000});

      let emissionCount = 0;
      service.paymentStatus$.subscribe(status => {
        emissionCount++;
        if (emissionCount === 2) { // Skip initial undefined
          expect(status).toEqual({status: 'OK'});
          done();
        }
      });

      service.confirmPin('1234');
      const req = httpMock.expectOne(req => req.url === 'https://example.com/callback');
      req.flush({status: 'OK'});
    });

    it('should not fire callback after cancelPin', () => {
      tapCardWithInvoiceLoaded({...cardWithdraw, pinLimit: 200000});

      service.cancelPin();

      expect(httpMock.match(req => req.url === 'https://example.com/callback').length).toBe(0);
    });

    it('should clear pinRequest after cancelPin', () => {
      const pinRequests: ({ amountMsat: number } | undefined)[] = [];
      service.pinRequest$.subscribe(v => pinRequests.push(v));

      tapCardWithInvoiceLoaded({...cardWithdraw, pinLimit: 200000});
      service.cancelPin();

      expect(pinRequests[pinRequests.length - 1]).toBeUndefined();
    });

    it('should clear a stale payment status when a new invoice is scanned', () => {
      tapCardWithInvoiceLoaded({...cardWithdraw});

      let lastStatus: WithdrawResponseData | undefined;
      service.paymentStatus$.subscribe(s => lastStatus = s);

      const req = httpMock.expectOne(r => r.url === 'https://example.com/callback');
      req.flush({status: 'OK'});
      expect(lastStatus).toEqual({status: 'OK'});

      // Scanning another invoice starts a new context: the old result is stale.
      // (Valid signed invoice without an amount section — only used as "different invoice".)
      service.parseLnurl('lnbc1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq0dehjqctdda6kuaqxqrrsscqpf0pqu8xusxl0dk6u8rwtv903h4grame5pr7325g3qmceyp698u6phzy8ap8wgzexsn7qlhc6fshlm3nls0lfp48mekeyytmsd5zm0sdspkvvuk5');

      expect(lastStatus).toBeUndefined();
    });

    it('should ignore second card tap while PIN pending', () => {
      tapCardWithInvoiceLoaded({...cardWithdraw, pinLimit: 200000});

      // Second tap with a different card
      service.fetchLnurlResponse(['lnurlw://example.com/card2']);
      const req2 = httpMock.expectOne('https://example.com/card2');
      req2.flush({...cardWithdraw, k1: 'other-k1', pinLimit: 200000});

      // Still no callback fired
      expect(httpMock.match(req => req.url === 'https://example.com/callback').length).toBe(0);

      // Confirming pays with the FIRST card's k1
      service.confirmPin('1234');
      const req = httpMock.expectOne(req => req.url === 'https://example.com/callback');
      expect(req.request.params.get('k1')).toBe('test-k1');
      req.flush({status: 'OK'});
    });

    it('should clear pending state on payment error so user can re-tap', () => {
      tapCardWithInvoiceLoaded({...cardWithdraw, pinLimit: 200000});

      service.confirmPin('0000'); // wrong pin
      const req = httpMock.expectOne(req => req.url === 'https://example.com/callback');
      req.flush({status: 'ERROR', reason: 'Wrong PIN'});

      // pinRequest cleared
      const pinRequests: ({ amountMsat: number } | undefined)[] = [];
      service.pinRequest$.subscribe(v => pinRequests.push(v));

      // Re-tap same card → should prompt for PIN again
      service.fetchLnurlResponse(['lnurlw://example.com/card']);
      const req2 = httpMock.expectOne('https://example.com/card');
      req2.flush({...cardWithdraw, pinLimit: 200000});

      expect(pinRequests[pinRequests.length - 1]).toEqual({amountMsat: 250000});
    });

    it('should clear pending payment on resetAllData', () => {
      tapCardWithInvoiceLoaded({...cardWithdraw, pinLimit: 200000});

      service.resetAllData();
      service.confirmPin('1234');

      // No callback fired after reset
      expect(httpMock.match(req => req.url === 'https://example.com/callback').length).toBe(0);
    });

    it('should emit payment error when invoice has no amount', () => {
      // Valid signed invoice without an amount section
      const NO_AMOUNT_INVOICE = 'lnbc1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq0dehjqctdda6kuaqxqrrsscqpf0pqu8xusxl0dk6u8rwtv903h4grame5pr7325g3qmceyp698u6phzy8ap8wgzexsn7qlhc6fshlm3nls0lfp48mekeyytmsd5zm0sdspkvvuk5';

      let lastStatus: WithdrawResponseData | undefined;
      service.paymentStatus$.subscribe(status => lastStatus = status);

      service.parseLnurl(NO_AMOUNT_INVOICE);
      service.fetchLnurlResponse(['lnurlw://example.com/card']);
      const req = httpMock.expectOne('https://example.com/card');
      req.flush({...cardWithdraw});

      expect(lastStatus).toEqual({status: 'ERROR', reason: 'Invoice has no amount.'});
      // No callback request should be made
      expect(httpMock.match(r => r.url === 'https://example.com/callback').length).toBe(0);
    });

    it('should ignore a second card tap while a payment is in flight', () => {
      tapCardWithInvoiceLoaded({...cardWithdraw});

      // First payment is in flight (request issued, response pending).
      // NOTE: expectOne/match consume requests from the open queue — a later
      // expectNone for the same URL only sees requests issued afterwards.
      const req1 = httpMock.expectOne(r => r.url === 'https://example.com/callback');

      // Second tap with a different card before the response arrives
      service.fetchLnurlResponse(['lnurlw://example.com/card2']);
      httpMock.expectOne('https://example.com/card2').flush({...cardWithdraw, k1: 'other-k1'});

      // The double-tap guard rejected the second tap: no duplicate payment.
      httpMock.expectNone(r => r.url === 'https://example.com/callback');

      req1.flush({status: 'OK'});
    });

    it('should fail visibly when tapping a receive-only card while an invoice is loaded', () => {
      service.parseLnurl(VALID_INVOICE);

      let lastStatus: WithdrawResponseData | undefined;
      service.paymentStatus$.subscribe(status => lastStatus = status);
      let processing: boolean | undefined;
      service.processing$.subscribe(p => processing = p);

      service.fetchLnurlResponse(['lnurlp://example.com/paycard']);
      httpMock.expectOne('https://example.com/paycard').flush({
        tag: 'payRequest',
        callback: 'https://example.com/callback',
        minSendable: 1000,
        maxSendable: 10000
      });

      expect(lastStatus).toEqual({status: 'ERROR', reason: 'This card cannot pay invoices.'});
      expect(processing).toBe(false);
    });

    it('should fail visibly when redeeming a voucher onto a card without payLink', () => {
      const voucherRequest: WithdrawRequestData = {
        tag: 'withdrawRequest',
        callback: 'https://example.com/cb',
        k1: 'voucher-k1',
        minWithdrawable: 5000,
        maxWithdrawable: 5000 // fixed amount → loads as voucher context
      };
      const card: WithdrawRequestData = {
        tag: 'withdrawRequest',
        callback: 'https://example.com/cb',
        k1: 'card-k1',
        minWithdrawable: 1000,
        maxWithdrawable: 10000
      };

      // Load the voucher (fixed-amount withdraw auto-loads as invoice context)
      service.fetchLnurlResponse(['lnurlw://example.com/voucher']);
      httpMock.expectOne('https://example.com/voucher').flush(voucherRequest);

      let lastStatus: WithdrawResponseData | undefined;
      service.paymentStatus$.subscribe(status => lastStatus = status);

      // Tap the card to redeem; the flow re-resolves the voucher
      service.fetchLnurlResponse(['lnurlw://example.com/card']);
      httpMock.expectOne('https://example.com/card').flush(card);
      httpMock.expectOne('https://example.com/voucher').flush(voucherRequest);

      expect(lastStatus).toEqual({status: 'ERROR', reason: 'This card cannot redeem vouchers.'});
    });
  });

  describe('presign fallback (stock backend)', () => {
    // Valid signed invoice: 250000 msat (250 sats), same vector as PIN flow
    const VALID_INVOICE = 'lnbc2500n1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5w3jhxapqd9h8vmmfvdjsxqrrsscqpfv5rlghu8vkkjys69g8qjr5gz6f2k3f2gfnhjcx3xlgg6hl445e9hymafxq2vn33lr2q56u3zmaf4pvq0wynhun3fjs6uuhgmu403hagqt0vcsy';

    const sender: WithdrawRequestData = {
      tag: 'withdrawRequest',
      callback: 'https://example.com/cb-send',
      k1: 'sender-k1',
      minWithdrawable: 1000, // 1 sat — stock backends start at the floor
      maxWithdrawable: 100000000,
      // Stock backends always ship a refund payLink; its INTERNAL resolution
      // must never clobber the tracked card lnurl (was the on-device bug).
      payLink: 'lnurlp://example.com/senderrefund'
    };
    const redeemer: WithdrawRequestData = {
      tag: 'withdrawRequest',
      callback: 'https://example.com/cb-redeem',
      k1: 'redeemer-k1',
      minWithdrawable: 1000,
      maxWithdrawable: 100000000,
      payLink: 'lnurlp://example.com/redpay'
    };
    const redeemPayRequest: PayRequestData = {
      tag: 'payRequest',
      callback: 'https://example.com/cb-redpay',
      minSendable: 1000,
      maxSendable: 100000000
    };

    function flushSenderRefund() {
      // Internal payLink refund resolution — always follows a sender tap.
      httpMock.expectOne('https://example.com/senderrefund').flush({
        tag: 'payRequest',
        callback: 'https://example.com/cb-refund',
        minSendable: 1000,
        maxSendable: 100000000
      });
    }

    function sendWithFallback(pin: string | undefined, senderData: WithdrawRequestData = sender) {
      // Tap sender card → withdrawRequest data arrives (fresh init)
      service.fetchLnurlResponse(['lnurlw://example.com/sender']);
      httpMock.expectOne('https://example.com/sender').flush(senderData);
      flushSenderRefund();

      // Presign attempt rejected by a stock backend
      service.fetchInvoice(senderData, undefined, 5000, pin).subscribe();
      httpMock.expectOne(r => r.url === 'https://example.com/cb-send').flush({status: 'ERROR', reason: 'Missing payment request.'});
      return senderData;
    }

    it('falls through to the plain lnurlw and redeems the entered amount with k1', (done) => {
      let lastInvoice: PresignedLnurl | PayResponseData | WithdrawRequestData | undefined;
      service.invoiceInvoice$.subscribe(v => lastInvoice = v);

      sendWithFallback(undefined);

      // No error surface: the card's own lnurl becomes the redeemable artifact
      expect(lastInvoice).toEqual(sender); // the stored withdraw data, not an lnurl string

      // Redeemer taps their card; the payLink chain must request the
      // ENTERED amount (5000 sats), never minWithdrawable (1 sat).
      service.fetchLnurlResponse(['lnurlw://example.com/redeemer']);
      httpMock.expectOne('https://example.com/redeemer').flush(redeemer);
      httpMock.expectOne('https://example.com/redpay').flush(redeemPayRequest); // payLink resolve
      const invoiceReq = httpMock.expectOne(r =>
        r.url === 'https://example.com/cb-redpay' && r.params.get('amount') === '5000000'
      );
      invoiceReq.flush({pr: VALID_INVOICE});

      // The withdraw callback pays with k1; no PIN (sender has no pinLimit)
      const payReq = httpMock.expectOne(r =>
        r.url === 'https://example.com/cb-send' &&
        r.params.get('k1') === 'sender-k1' &&
        r.params.get('pr') === VALID_INVOICE &&
        r.params.get('pin') === null
      );
      expect(payReq.request.params.get('k1')).toBe('sender-k1');
      payReq.flush({status: 'OK'});
      done();
    });

    it('reuses the PIN from the amount screen when the sending card enforces pinLimit', (done) => {
      const pinRequests: ({amountMsat: number} | undefined)[] = [];
      service.pinRequest$.subscribe(v => pinRequests.push(v));

      sendWithFallback('1234', {...sender, pinLimit: 200000});

      service.fetchLnurlResponse(['lnurlw://example.com/redeemer']);
      httpMock.expectOne('https://example.com/redeemer').flush(redeemer);
      httpMock.expectOne('https://example.com/redpay').flush(redeemPayRequest);
      httpMock.expectOne(r => r.url === 'https://example.com/cb-redpay').flush({pr: VALID_INVOICE});

      // pinLimit 200000 <= invoice 250000 → PIN required; the already entered
      // PIN must ride with the k1 instead of causing a second prompt.
      const payReq = httpMock.expectOne(r =>
        r.url === 'https://example.com/cb-send' &&
        r.params.get('k1') === 'sender-k1' &&
        r.params.get('pin') === '1234'
      );
      expect(payReq.request.params.get('pin')).toBe('1234');
      payReq.flush({status: 'OK'});

      expect(pinRequests.every(v => v === undefined)).toBe(true);
      done();
    });

    it('other presign rejections still surface as errors with no fallback', (done) => {
      let lastInvoice: PresignedLnurl | PayResponseData | WithdrawRequestData | undefined;
      service.invoiceInvoice$.subscribe(v => lastInvoice = v);

      service.fetchLnurlResponse(['lnurlw://example.com/sender']);
      httpMock.expectOne('https://example.com/sender').flush(sender);
      flushSenderRefund();

      service.fetchInvoice(sender, undefined, 5000, '0000').subscribe({
        next: () => fail('should not emit a value'),
        error: (err) => {
          expect(err.message).toBe('Wrong Pin. 2 tries left.');
          expect(lastInvoice).toBeUndefined();
          done();
        }
      });
      httpMock.expectOne(r => r.url === 'https://example.com/cb-send').flush({status: 'ERROR', reason: 'Wrong Pin. 2 tries left.'});
    });

    it('skips the presign probe entirely when disabled in settings (default)', (done) => {
      settingsMock.presignEnabled = false;

      let lastInvoice: PresignedLnurl | PayResponseData | WithdrawRequestData | undefined;
      service.invoiceInvoice$.subscribe(v => lastInvoice = v);

      service.fetchLnurlResponse(['lnurlw://example.com/sender']);
      httpMock.expectOne('https://example.com/sender').flush(sender);
      flushSenderRefund();

      service.fetchInvoice(sender, undefined, 5000, '1234').subscribe(() => {
        expect(lastInvoice).toEqual(sender); // stored data, not an lnurl string
        // No callback request at all — straight to the plain lnurlw artifact
        expect(httpMock.match(r => r.url === 'https://example.com/cb-send').length).toBe(0);
        expect(service.redeemAmountMsat).toBe(5000000);
        done();
      });
    });

    it('toggle-off device flow: full redemption of the fallback pays the screen amount', (done) => {
      settingsMock.presignEnabled = false;

      service.fetchLnurlResponse(['lnurlw://example.com/sender']);
      httpMock.expectOne('https://example.com/sender').flush(sender);
      flushSenderRefund();

      service.fetchInvoice(sender, undefined, 5000, undefined).subscribe(() => {
        // Redeemer taps card 2 (spec mirrors the device session)
        service.fetchLnurlResponse(['lnurlw://example.com/redeemer']);
        httpMock.expectOne('https://example.com/redeemer').flush(redeemer);
        httpMock.expectOne('https://example.com/redpay').flush(redeemPayRequest);
        const invoiceReq = httpMock.expectOne(r =>
          r.url === 'https://example.com/cb-redpay' && r.params.get('amount') === '5000000'
        );
        invoiceReq.flush({pr: VALID_INVOICE});
        const payReq = httpMock.expectOne(r =>
          r.url === 'https://example.com/cb-send' &&
          r.params.get('k1') === 'sender-k1' &&
          r.params.get('pr') === VALID_INVOICE
        );
        expect(payReq.request.method).toBe('GET');
        payReq.flush({status: 'OK'});
        done();
      });
    });
  });
});
