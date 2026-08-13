import {inject, Injectable, NgZone} from '@angular/core';
import {HttpClient, HttpParams} from '@angular/common/http';
import {BehaviorSubject, EMPTY, Observable, catchError, finalize, map, of, throwError, timeout} from 'rxjs';
import {
  LnurlData,
  PayRequestData,
  PayResponseData,
  PresignedLnurl,
  WithdrawRequestData,
  WithdrawResponseData
} from '../model/lnurl.model';
import {bech32} from 'bech32';
import {decode} from 'light-bolt11-decoder';
import {Router} from '@angular/router';
import {msatToSats, satsToMsat} from '../app/shared/utils/units';
import {SettingsService} from './settings.service';

interface PendingPayment {
  withdrawRequest: WithdrawRequestData;
  pr: string;
}

/** Network ceiling for every LNURL request — a hung server must not pin the UI. */
const HTTP_TIMEOUT_MS = 15000;

@Injectable({
  providedIn: 'root'
})
export class LnurlService {
  private readonly _ngZone = inject(NgZone);
  private readonly _httpClient = inject(HttpClient);
  private readonly _router = inject(Router);
  private readonly _settings = inject(SettingsService);

  private readonly lnurlWithdrawSubject = new BehaviorSubject<WithdrawRequestData | undefined>(undefined);
  public readonly lnurlWithdraw$ = this.lnurlWithdrawSubject.asObservable();

  private readonly lnurlPaySubject = new BehaviorSubject<PayRequestData | undefined>(undefined);
  public readonly lnurlPay$ = this.lnurlPaySubject.asObservable();

  private readonly lnurlInvoiceSubject = new BehaviorSubject<LnurlData | undefined>(undefined);
  public readonly lnurlInvoice$ = this.lnurlInvoiceSubject.asObservable();

  private readonly invoiceSubject = new BehaviorSubject<PresignedLnurl | PayResponseData | WithdrawRequestData | undefined>(undefined);
  public readonly invoiceInvoice$ = this.invoiceSubject.asObservable();

  private readonly paymentStatusSubject = new BehaviorSubject<WithdrawResponseData | undefined>(undefined);
  public readonly paymentStatus$ = this.paymentStatusSubject.asObservable();

  private readonly pinRequestSubject = new BehaviorSubject<{ amountMsat: number } | undefined>(undefined);
  public readonly pinRequest$ = this.pinRequestSubject.asObservable();

  /** Emits a user-facing message when a card fetch fails or times out. */
  private readonly lnurlErrorSubject = new BehaviorSubject<string | undefined>(undefined);
  public readonly lnurlError$ = this.lnurlErrorSubject.asObservable();

  /** True while a payment/withdraw is being processed after a card tap. */
  private readonly processingSubject = new BehaviorSubject<boolean>(false);
  public readonly processing$ = this.processingSubject.asObservable();

  private pendingPayment?: PendingPayment;
  /** True while a withdraw callback for a payment is in flight (double-tap guard). */
  private paymentInFlight = false;

  /**
   * Set when a presign attempt is rejected by a stock backend (see
   * fetchInvoice): the user entered amount+PIN on the amount screen, so the
   * resulting plain lnurlw must redeem EXACTLY that amount, and the already
   * entered PIN rides the paying request — no second prompt.
   */
  private redeemContext?: { amountMsat: number; pin?: string };

  constructor() {
  }

  /** Amount forced by a stock-backend fallback, if any (msat). */
  get redeemAmountMsat(): number | undefined {
    return this.redeemContext?.amountMsat;
  }

  /** True while a stock-backend presign fallback is active (tap-only UX). */
  get isPresignFallback(): boolean {
    return this.redeemContext !== undefined;
  }

  public resetAllData() {
    this.lnurlWithdrawSubject.next(undefined);
    this.lnurlPaySubject.next(undefined);
    this.lnurlInvoiceSubject.next(undefined);
    this.invoiceSubject.next(undefined);
    this.paymentStatusSubject.next(undefined);
    this.lnurlErrorSubject.next(undefined);
    this.processingSubject.next(false);
    this.paymentInFlight = false;
    this.redeemContext = undefined;
    this.clearPendingPayment();
  }

  public setInvoice(data: LnurlData) {
    this.lnurlInvoiceSubject.next(data);
  }

  /**
   * Parses clipboard/scan content. Returns what it was so callers can decide
   * whether to navigate: invoices navigate themselves to the invoice page,
   * LNURLs are fetched in the background while the caller shows the details
   * loading screen.
   */
  public parseLnurl(data: string): 'invoice' | 'lnurl' {
    // Pasted content often carries surrounding whitespace/newlines.
    const trimmed = data.trim();
    const lowerData = trimmed.toLowerCase();
    if (trimmed.includes('@')) {
      const [user, domain] = trimmed.split('@');
      const wellKnown = `lnurlp://${domain}/.well-known/lnurlp/${user}`;
      this.fetchLnurlResponse([wellKnown]);
    } else if (lowerData.includes('lnbc')) {
      // Must run before the 'lnurl' substring check: bolt11 bech32 data can
      // legally contain the substring 'lnurl', but LNURL bech32 can never
      // contain 'lnbc' (its charset has no 'b').
      const lnbcIdx = lowerData.indexOf('lnbc');
      const lnbcSegment = lowerData.slice(lnbcIdx);

      // A freshly scanned invoice starts a new context: any payment result
      // from a previous invoice is stale and must not replay.
      this.paymentStatusSubject.next(undefined);
      this.invoiceSubject.next({pr: lnbcSegment});
      void this._router.navigate(['tabs/wallet/invoice']);
      return 'invoice';
    } else if (lowerData.startsWith('https') || lowerData.startsWith('lnurlw') || lowerData.startsWith('lnurlp')) {
      this.fetchLnurlResponse([trimmed]);
    } else if (lowerData.includes('lnurl')) {
      this.fetchLnurlResponse([this.decodeLNURL(lowerData)]);
    } else {
      throw new Error('Could not parse data as known LNURL format.');
    }
    return 'lnurl';
  }

  public getLnurlData(lnurl: string) {
    return this.resolveLnurl(lnurl);
  }

  /**
   * Looks for LNURLw or LNURLp strings in the tag and calls the first one found
   */
  public fetchLnurlResponse(lnurlsOnTag: (string | undefined)[]) {
    // TODO for the moment just use the first lnurl seen
    if (lnurlsOnTag.length !== 0 && lnurlsOnTag[0]) {
      this.lnurlErrorSubject.next(undefined);

      // When an invoice/voucher is present, this tap is a payment attempt.
      // Signal processing immediately (at tap time) instead of waiting for
      // the card's LNURL to resolve over the network first.
      const isPaymentAttempt = !!this.invoiceSubject.value;
      if (isPaymentAttempt) {
        this.processingSubject.next(true);
      }

      this.resolveLnurl(lnurlsOnTag[0])
        .pipe(
          timeout(HTTP_TIMEOUT_MS),
          // The error is fully handled via subjects here. Rethrowing would let
          // it escape into the GlobalErrorHandler, which would toast/log the
          // raw HttpErrorResponse — its message embeds the full callback URL
          // (k1, sometimes PIN). Complete silently instead.
          catchError((err) => {
            this._ngZone.run(() => {
              if (isPaymentAttempt) {
                this.handlePaymentError(err);
              } else {
                this.lnurlErrorSubject.next(this.toErrorMessage(err));
              }
            });
            return EMPTY;
          })
        )
        .subscribe(lnurlRes => {
          const current = this.invoiceSubject.value;
          if (current) {
            // Invoice is already here to be paid/received
            if ('pr' in current) {
              this.pay(lnurlRes, current.pr);
            } else if ('lnurl' in current) {
              this.withdraw(lnurlRes, current.lnurl);
            } else if (current.tag === 'withdrawRequest') {
              // Presign fallback: artifact is the stored withdraw data.
              this.redeemWithdrawRequest(lnurlRes, current);
            }
          } else {
            // Fresh init
            this.updateLnurlInvoiceSubject(lnurlRes, lnurlsOnTag[0]);
          }
        })
    }
  }

  private handlePaymentError(err: unknown) {
    this.processingSubject.next(false);
    this.paymentStatusSubject.next({status: 'ERROR', reason: this.toErrorMessage(err)});
  }

  private toErrorMessage(err: unknown): string {
    if (err instanceof Error && err.name === 'TimeoutError') {
      return 'Request timed out. Check your connection and try again.';
    }
    // Hand-written Errors carry safe, user-facing messages — pass them
    // through. HttpErrorResponse is NOT an Error instance (its message embeds
    // the full request URL with k1/PIN), so it falls through to the generic
    // message below.
    if (err instanceof Error && !/https?:\/\//i.test(err.message)) {
      return err.message;
    }
    return 'Failed to load card data. Please try again.';
  }

  private withdraw(lnurlRes: LnurlData, withdrawUrl: string) {
    this.resolveLnurl(withdrawUrl)
      .pipe(timeout(HTTP_TIMEOUT_MS))
      .subscribe({
        next: (withdrawRequest) => {
          if (withdrawRequest.tag !== 'withdrawRequest') {
            this.handlePaymentError(new Error('Expected withdraw request to pay invoice.'));
            return;
          }
          this.redeemWithdrawRequest(lnurlRes, withdrawRequest);
        },
        error: (err) => this.handlePaymentError(err),
      });
  }

  /**
   * Redeems an already-resolved withdraw artifact via the tapped card's
   * payLink (or payRequest data): invoice for the screen amount, paid by the
   * artifact's k1. Used by both the voucher path and the presign fallback
   * (which must NOT re-resolve one-shot lnurlw links).
   */
  private redeemWithdrawRequest(lnurlRes: LnurlData, withdrawRequest: WithdrawRequestData) {
    // The amount that moves is the amount on screen — never silently
    // substitute minWithdrawable. Withdraw artifacts with min==max
    // (presigned vouchers) make both identical, so the fallback context
    // only matters for plain (stock-backend) lnurlw links.
    const amountSats = this.redeemAmountSats ?? msatToSats(withdrawRequest.minWithdrawable);

    if (lnurlRes.tag === 'withdrawRequest') {
      if (lnurlRes.payLink) {
        this.resolveLnurl(lnurlRes.payLink)
          .pipe(timeout(HTTP_TIMEOUT_MS))
          .subscribe({
            next: (payData) => {
              if (payData.tag === 'payRequest') {
                this.getPayRequest(amountSats, payData).subscribe({
                  next: (prData) => this.pay(withdrawRequest, prData.pr),
                  error: (err) => this.handlePaymentError(err),
                });
              } else {
                this.handlePaymentError(new Error('Was expecting payRequest data!'));
              }
            },
            error: (err) => this.handlePaymentError(err),
          });
      } else {
        // Without a payLink the card cannot fund the voucher redemption.
        // Failing silently would leave the processing spinner up forever.
        this.handlePaymentError(new Error('This card cannot redeem vouchers.'));
      }
    } else if (lnurlRes.tag === 'payRequest') {
      this.getPayRequest(amountSats, lnurlRes).subscribe({
        next: (prData) => this.pay(withdrawRequest, prData.pr),
        error: (err) => this.handlePaymentError(err),
      });
    }
  }

  private pay(withdrawRequest: LnurlData, pr: string) {
    if (withdrawRequest.tag !== 'withdrawRequest') {
      // Tapped a receive-only card while an invoice is loaded. Fail visibly —
      // throwing here would escape to the GlobalErrorHandler and leave the
      // processing flag set forever.
      this.processingSubject.next(false);
      this.paymentStatusSubject.next({status: 'ERROR', reason: 'This card cannot pay invoices.'});
      return;
    }

    // Ignore a concurrent tap while a PIN prompt is pending or a payment is in flight.
    if (this.pendingPayment || this.paymentInFlight) {
      return;
    }

    let amountMsat: number;
    try {
      amountMsat = this.decodeInvoiceAmountMsat(pr);
    } catch {
      this.processingSubject.next(false);
      this.paymentStatusSubject.next({status: 'ERROR', reason: 'Invoice has no amount.'});
      return;
    }

    if (withdrawRequest.pinLimit !== undefined && amountMsat >= withdrawRequest.pinLimit) {
      // Send flow: the PIN was already entered (and fork-validated) on the
      // amount screen — reuse it instead of prompting again.
      const storedPin = this.redeemContext?.pin;
      if (storedPin) {
        this.processingSubject.next(true);
        this.executePayment(withdrawRequest, storedPin, pr);
        return;
      }
      this.pendingPayment = {withdrawRequest, pr};
      this.pinRequestSubject.next({amountMsat});
      return;
    }

    this.processingSubject.next(true);
    this.executePayment(withdrawRequest, undefined, pr);
  }

  public confirmPin(pin: string) {
    if (!this.pendingPayment) {
      return;
    }

    const {withdrawRequest, pr} = this.pendingPayment;
    this.clearPendingPayment();
    this.processingSubject.next(true);
    this.executePayment(withdrawRequest, pin, pr);
  }

  public cancelPin() {
    this.processingSubject.next(false);
    this.clearPendingPayment();
  }

  private clearPendingPayment() {
    this.pendingPayment = undefined;
    this.pinRequestSubject.next(undefined);
  }

  private executePayment(withdrawRequest: WithdrawRequestData, pin: string | undefined, pr: string) {
    this.paymentInFlight = true;
    this.getWithdrawRequest(withdrawRequest, pin, undefined, pr)
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        // Handled here — see fetchLnurlResponse for why this must not rethrow.
        catchError((err) => {
          this.processingSubject.next(false);
          this.paymentStatusSubject.next({status: 'ERROR', reason: this.toErrorMessage(err)});
          return EMPTY;
        }),
        finalize(() => this.paymentInFlight = false)
      )
      .subscribe((payedResponse) => {
        this.processingSubject.next(false);
        if ('status' in payedResponse) {
          if (payedResponse.status.toLowerCase() === 'error') {
            // Allow the user to re-tap the card after a failed attempt
            this.clearPendingPayment();
          }
          this.paymentStatusSubject.next(payedResponse);
        }
      });
  }

  private decodeInvoiceAmountMsat(pr: string): number {
    const decodedInvoice = decode(pr);
    const amountValue = decodedInvoice.sections.find((section) => section.name === 'amount')?.value;
    if (amountValue === undefined) {
      throw new Error('Invoice has no amount.');
    }
    return Number(amountValue);
  }

  private decodeLNURL(encoded: string) {
    const lnurlIdx = encoded.indexOf('lnurl');
    const lnurlSegment = encoded.slice(lnurlIdx);

    const {words} = bech32.decode(lnurlSegment, 1024);
    const bytes = new Uint8Array(bech32.fromWords(words));
    return new TextDecoder().decode(bytes);
  }

  private updateLnurlInvoiceSubject(lnurlRes: WithdrawRequestData | PayRequestData | WithdrawResponseData, lnurl?: string) {
    if (!('tag' in lnurlRes)) {
      this.handleResponseWithoutTag(lnurlRes);
      return;
    }

      if (lnurlRes.tag === 'withdrawRequest') {
      this.handleWithdrawRequest(lnurlRes, lnurl);
      return;
    }

    if (lnurlRes.tag === 'payRequest') {
      this.handlePayRequest(lnurlRes, lnurl);
      return;
    }

    throw new Error('Cannot parse LNURL response!');
  }

  private handleWithdrawRequest(lnurlRes: WithdrawRequestData, lnurl?: string) {
    this._ngZone.run(() => this.lnurlWithdrawSubject.next(lnurlRes));

    if (lnurlRes.payLink) {
      this.fetchLnurlResponse([lnurlRes.payLink]);
    }

    if (lnurlRes.maxWithdrawable === lnurlRes.minWithdrawable && lnurl) {
      this.invoiceSubject.next({lnurl, status: 'OK'});
      void this._router.navigate(['tabs/wallet/invoice']);
    }
  }

  private handlePayRequest(lnurlRes: PayRequestData, lnurl?: string) {
    this._ngZone.run(() => this.lnurlPaySubject.next(lnurlRes));

    if (lnurlRes.maxSendable === lnurlRes.minSendable && lnurl) {
      this.invoiceSubject.next({lnurl, status: 'OK'});
      void this._router.navigate(['tabs/wallet/invoice']);
    }
  }

  private handleResponseWithoutTag(lnurlRes: WithdrawResponseData) {
    if (lnurlRes.status.toLowerCase() === 'error') {
      throw new Error(`Error: ${lnurlRes.reason}`);
    }
    throw new Error('Cannot parse LNURL response!');
  }

  private resolveLnurl(lnurl: string): Observable<LnurlData> {
    // Scheme matching is case-insensitive (tags/pastes arrive in any case);
    // the remainder of the URL keeps its original case since paths are
    // case-sensitive.
    const lowerLnurl = lnurl.toLowerCase();
    if (lowerLnurl.startsWith('lnurlw://')) {
      return this._httpClient.get<WithdrawRequestData>('https://' + lnurl.slice('lnurlw://'.length));
    }
    if (lowerLnurl.startsWith('lnurlp://')) {
      return this._httpClient.get<PayRequestData>('https://' + lnurl.slice('lnurlp://'.length));
    }
    if (lowerLnurl.startsWith('https://')) {
      if (lnurl.includes('lightning=') && lnurl.includes('lnurl')) {
        return this._httpClient.get<LnurlData>(this.decodeLNURL(lnurl))
      }
      return this._httpClient.get<LnurlData>(lnurl);
    }
    // throwError, not throw: the message flows through the callers' catchError
    // pipelines, and it must never embed the raw link — it can carry a k1.
    return throwError(() => new Error('Cannot parse LNURL link.'));
  }

  /**
   * Requests an invoice (payRequest) or a presigned voucher (withdrawRequest
   * with amountSats). Emits the result to invoiceSubject on success and returns
   * the observable so callers can wait for the response and handle errors
   * (e.g. a rejected PIN) instead of navigating blindly.
   *
   * amountSats is always in SATS at this boundary. What goes on the wire
   * differs per branch (see getPayRequest / getWithdrawRequest).
   */
  fetchInvoice(data: LnurlData, payRequest?: string, amountSats?: number, pin?: string): Observable<PresignedLnurl | PayResponseData | WithdrawRequestData> {
    this.invoiceSubject.next(undefined);

    let cbObservable: Observable<PresignedLnurl | PayResponseData | WithdrawResponseData>;
    if (data.tag === 'withdrawRequest') {
      // Presign probe is opt-in (Settings, default off). With it disabled we
      // skip straight to plain pay-from-card — the stock answer to the probe
      // only ever leads to the same fallback anyway.
      if (amountSats !== undefined && !this._settings.presignEnabled) {
        return of(this.handlePresignUnsupported(data, amountSats, pin));
      }
      cbObservable = this.getWithdrawRequest(data, pin, amountSats, payRequest);
    } else if (data.tag === 'payRequest') {
      cbObservable = this.getPayRequest(amountSats, data);
    } else {
      throw new Error('data is neither withdraw or pay request');
    }

    return cbObservable.pipe(
      timeout(HTTP_TIMEOUT_MS),
      map((response) => {
        if ('status' in response && response.status.toLowerCase() === 'error') {
          // Stock backends (no presign support) answer the amount probe with
          // exactly this reason — the hit stays unspent (spend happens only
          // after the pr check), so the same k1 can still pay normally right
          // after. Fall through to the plain lnurlw flow; the user never
          // sees an error.
          if (response.reason === 'Missing payment request.' && data.tag === 'withdrawRequest' && amountSats !== undefined) {
            return this.handlePresignUnsupported(data, amountSats, pin);
          }
          throw new Error(response.reason ?? 'Request failed.');
        }
        if ('pr' in response || 'lnurl' in response) {
          this.invoiceSubject.next(response);
          return response;
        }
        throw new Error('Unexpected response from server.');
      }),
      catchError((err: unknown) => {
        // Callers show err.message inline (e.g. amount page): translate the
        // raw RxJS TimeoutError into something human.
        if (err instanceof Error && err.name === 'TimeoutError') {
          return throwError(() => new Error('Request timed out. Check your connection and try again.'));
        }
        return throwError(() => err);
      })
    );
  }

  /**
   * Presign fallback: the backend does not understand the amount extension,
   * so no voucher gets created. Proceed tap-only with the tapped card's own
   * withdraw data ("normal lnurlw") — NEVER re-resolve the one-shot link.
   * The entered amount (+PIN) is kept as context so the redemption pays
   * EXACTLY that (never minWithdrawable) and uses the already entered PIN
   * instead of re-prompting.
   */
  private handlePresignUnsupported(data: WithdrawRequestData, amountSats: number, pin: string | undefined): WithdrawRequestData {
    this.redeemContext = {amountMsat: satsToMsat(amountSats), pin};
    this.invoiceSubject.next(data);
    return data;
  }

  /** Redemption amount override (sats) — set only during a presign fallback. */
  private get redeemAmountSats(): number | undefined {
    return this.redeemContext ? msatToSats(this.redeemContext.amountMsat) : undefined;
  }

  /** LUD-06: payRequest callbacks take the amount in MSAT, so sats → msat here. */
  private getPayRequest(amountSats: number | undefined, data: PayRequestData) {
    if (!amountSats) {
      throw new Error('Amount is mandatory for payRequest.');
    }
    const callback = this.secureCallback(data.callback);
    if (!callback) {
      return throwError(() => new Error('Insecure callback URL (https required).'));
    }
    const httpParams = new HttpParams()
      .set('amount', satsToMsat(amountSats));
    return this._httpClient.get<PayResponseData>(callback, {params: httpParams});
  }

  /**
   * Callbacks carry k1 (and sometimes the PIN) in the query string — they
   * must never go over plaintext http. Returns undefined for insecure URLs.
   */
  private secureCallback(url: string): string | undefined {
    return url.toLowerCase().startsWith('https://') ? url : undefined;
  }

  /**
   * Withdraw callback. The `amount` query param is a custom fork extension
   * for issuing presigned vouchers — LUD-03/LUD-24 define no such param (the
   * amount normally lives in `pr`). Like every amount the client emits, it
   * carries MSAT: same denomination LNURLcash (luds PR #301) defines for
   * `amount`. UI sats → msat happens exactly here, no exceptions.
   */
  private getWithdrawRequest(data: WithdrawRequestData, pin: string | undefined, amountSats: number | undefined, payRequest: string | undefined) {
    const callback = this.secureCallback(data.callback);
    if (!callback) {
      return throwError(() => new Error('Insecure callback URL (https required).'));
    }

    let cbObservable: Observable<PresignedLnurl | PayResponseData | WithdrawResponseData> | undefined;
    let httpParams = new HttpParams()
      .set('k1', data.k1);
    if (pin) {
      httpParams = httpParams.set('pin', pin);
    }

    if (amountSats) {
      httpParams = httpParams.set('amount', satsToMsat(amountSats));
      cbObservable = this._httpClient.get<PresignedLnurl>(callback, {params: httpParams});
    }
    if (payRequest) {
      httpParams = httpParams.set('pr', payRequest);
      cbObservable = this._httpClient.get<WithdrawResponseData>(callback, {params: httpParams});
    }

    if (!cbObservable) {
      throw new Error('Amount or payRequest (one of) must be set for withdrawRequest.');
    }
    return cbObservable;
  }
}
