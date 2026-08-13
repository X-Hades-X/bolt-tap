import {TestBed} from '@angular/core/testing';

import {SettingsService} from './settings.service';

describe('SettingsService', () => {
  let service: SettingsService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(SettingsService);
  });

  it('defaults presign to OFF (stock-backend safe default)', () => {
    expect(service.presignEnabled).toBe(false);
  });

  it('persists the toggle and reads it back', () => {
    service.setPresignEnabled(true);

    expect(localStorage.getItem('boltTap.presignEnabled')).toBe('1');
    expect(service.presignEnabled).toBe(true);

    const reloaded = new SettingsService();
    expect(reloaded.presignEnabled).toBe(true);
  });

  it('can be turned back off', () => {
    service.setPresignEnabled(true);
    service.setPresignEnabled(false);

    expect(service.presignEnabled).toBe(false);
    expect(localStorage.getItem('boltTap.presignEnabled')).toBe('0');
  });

  it('defaults both info-seen flags to false', () => {
    expect(service.presignInfoSeen).toBe(false);
    expect(service.printerInfoSeen).toBe(false);
  });

  it('persists the info-seen flags', () => {
    service.markPresignInfoSeen();
    service.markPrinterInfoSeen();

    expect(service.presignInfoSeen).toBe(true);
    expect(service.printerInfoSeen).toBe(true);

    const reloaded = new SettingsService();
    expect(reloaded.presignInfoSeen).toBe(true);
    expect(reloaded.printerInfoSeen).toBe(true);
  });
});
