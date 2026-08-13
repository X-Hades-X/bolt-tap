import {Injectable} from '@angular/core';
import {BleDevice, BluetoothLe} from '@capacitor-community/bluetooth-le';
import {EncodedImage, ImageEncoder, LabelType, NiimbotCapacitorBleClient} from '@mmote/niimbluelib';

@Injectable({
  providedIn: 'root'
})
export class BleService {
  device?: BleDevice = undefined;
  client: NiimbotCapacitorBleClient | null = null;

  async initialize() {
    await BluetoothLe.initialize();
  }

  async scanDevices(): Promise<BleDevice> {
    this.device = undefined;
    const device = await BluetoothLe.requestDevice(undefined);
    this.device = device;
    return device;
  }

  async connect(deviceId: string) {
    this.client = new NiimbotCapacitorBleClient();
    await this.client.connect({ deviceId }); // connects via BLE
    return this.client;
  }

  async print(nativeElement: HTMLCanvasElement) {
    if (!this.client) {
      throw new Error('No printer connected. Please connect a printer first.');
    }

    this.client.stopHeartbeat();

    try {
      const currentPrintTask = this.client.abstraction.newPrintTask('D110', {
        totalPages: 1,
        density: 3,
        labelType: LabelType.WithGaps,
        statusPollIntervalMs: 100,
        statusTimeoutMs: 8000
      });

      const encoded: EncodedImage = ImageEncoder.encodeCanvas(nativeElement, 'top');

      await currentPrintTask.printInit();
      await currentPrintTask.printPage(encoded, 1);
      await currentPrintTask.waitForFinished();
      await this.client.abstraction.printEnd();
      await currentPrintTask.printEnd();
    } finally {
      // Always restart the heartbeat, also on failure — otherwise the printer
      // connection is left in a wedged state after a failed job.
      this.client.startHeartbeat();
    }
  }
}
