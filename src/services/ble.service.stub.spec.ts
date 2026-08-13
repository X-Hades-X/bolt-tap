import {TestBed} from '@angular/core/testing';

import {BleService} from './ble.service.stub';

describe('BleService (noble build stub)', () => {
  let service: BleService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(BleService);
  });

  it('is never connected to a printer', () => {
    expect(service.device).toBeUndefined();
    expect(service.client).toBeNull();
  });

  it('rejects all printer operations with a clear message', async () => {
    await expectAsync(service.scanDevices()).toBeRejectedWithError('Printing is not supported in this build.');
    await expectAsync(service.connect('any-id')).toBeRejectedWithError('Printing is not supported in this build.');
    const canvas = document.createElement('canvas');
    await expectAsync(service.print(canvas)).toBeRejectedWithError('Printing is not supported in this build.');
  });
});
