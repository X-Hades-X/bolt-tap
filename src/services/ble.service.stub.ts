import {Injectable} from '@angular/core';

/**
 * Build-variant stub used by the "noble" (no-Bluetooth) build.
 *
 * THIS FILE MUST STAY API-COMPATIBLE WITH ble.service.ts.
 * angular.json's `noble` configuration swaps it in via fileReplacements, and
 * the two BLE packages are removed from node_modules for that build — so this
 * file must not import anything printer-related. If BleService's API changes,
 * change this stub too, or the noble build breaks.
 */
@Injectable({
  providedIn: 'root'
})
export class BleService {
  // Shape-compatible with the real service: presence checks (device/truthy)
  // and client?.isConnected() are all consumers use.
  device?: unknown = undefined;
  client: {isConnected(): boolean} | null = null;

  async initialize(): Promise<void> {
    return;
  }

  async scanDevices(): Promise<unknown> {
    throw new Error('Printing is not supported in this build.');
  }

  async connect(_deviceId: string): Promise<null> {
    throw new Error('Printing is not supported in this build.');
  }

  async print(_nativeElement: HTMLCanvasElement): Promise<void> {
    throw new Error('Printing is not supported in this build.');
  }
}
