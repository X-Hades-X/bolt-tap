import {inject, Injectable} from '@angular/core';
import {LnurlService} from "./lnurl.service";
import {BehaviorSubject} from "rxjs";
import {NDEFMessage, NFC} from "@exxili/capacitor-nfc";

@Injectable({
  providedIn: 'root'
})
export class NfcService {
  private readonly lnurlService = inject(LnurlService);

  private _scanning = false;

  // Observable for the last scanned tag
  private readonly tagSubject = new BehaviorSubject<NDEFMessage<string>[] | undefined>(undefined);
  public readonly tag$ = this.tagSubject.asObservable();

  constructor() {
  }

  /** Returns whether the scan session actually started (iOS permission flow). */
  async enableNfc$(): Promise<boolean> {
    try {
      await NFC.startScan();
      return true;
    } catch (error) {
      console.error('Error starting NFC scan:', error);
      return false;
    }
  }

  startScan() {
    if (this._scanning) {
      return;
    }

    try {
      NFC.onRead((data) => {
        try {
          const messages = data.string().messages;
          this.tagSubject.next(messages);
          this.lnurlService.fetchLnurlResponse(this.findLnurl(messages));
        } catch (err) {
          // A malformed tag must not crash the native read callback.
          console.error('Failed to process NFC tag:', err);
        }
      });
      this._scanning = true;
    } catch (err) {
      console.error('Failed to start NFC scan:', err);
      throw err;
    }
  }

  private findLnurl(messages: NDEFMessage<string>[]) {
    return messages.map(message => {
      return message.records.find(record =>
        record.payload.toLowerCase().startsWith('lnurl')
      )?.payload;
    });
  }
}
