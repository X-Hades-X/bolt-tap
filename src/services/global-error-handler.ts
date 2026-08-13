import {ErrorHandler, inject, Injectable, NgZone} from '@angular/core';
import {HttpErrorResponse} from '@angular/common/http';
import {ToastController} from '@ionic/angular';

const NETWORK_ERROR_MESSAGE = 'Network request failed. Please try again.';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly toastController = inject(ToastController);
  private readonly ngZone = inject(NgZone);

  handleError(error: unknown): void {
    const message = this.extractErrorMessage(error);

    // We're outside Angular zone, so jump back in:
    this.ngZone.run(() => {
      this.showToast(message);
    });

    // Diagnostics are kept, but must never contain URLs: LNURL callback URLs
    // carry k1 (and sometimes the PIN) in their query string.
    if (error instanceof HttpErrorResponse) {
      console.error(`Global Error: HTTP ${error.status} ${error.statusText}`.trim());
    } else {
      console.error('Global Error:', message);
    }
  }

  private extractErrorMessage(error: unknown): string {
    // HttpErrorResponse.message embeds the full request URL — including k1/PIN
    // credentials. Never surface it.
    if (error instanceof HttpErrorResponse) {
      return NETWORK_ERROR_MESSAGE;
    }
    if (error instanceof Error) {
      return this.sanitize(error.message);
    }
    if (typeof error === 'string') {
      return this.sanitize(error);
    }
    if (error !== null && error !== undefined) {
      // Handle objects with a message property
      const errorObj = error as Record<string, unknown>;
      if (typeof errorObj['message'] === 'string') {
        return this.sanitize(errorObj['message']);
      }
    }
    return 'An unexpected error occurred';
  }

  /** Any message containing a URL could leak credentials — replace it. */
  private sanitize(message: string): string {
    if (/https?:\/\//i.test(message)) {
      return NETWORK_ERROR_MESSAGE;
    }
    return message;
  }

  private async showToast(message: string) {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color: 'danger',
      position: 'top',
    });

    void toast.present();
  }
}
