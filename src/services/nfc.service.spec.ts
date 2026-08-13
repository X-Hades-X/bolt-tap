import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';

import { NfcService } from './nfc.service';

describe('NfcService', () => {
  let service: NfcService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient()]
    });
    service = TestBed.inject(NfcService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
