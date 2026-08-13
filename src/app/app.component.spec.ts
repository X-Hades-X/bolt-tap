import {ComponentFixture, TestBed} from '@angular/core/testing';
import {provideRouter} from '@angular/router';

import {AppComponent} from './app.component';
import {DeepLinkService} from '../services/deep-link.service';

describe('AppComponent', () => {
  let fixture: ComponentFixture<AppComponent>;
  let deepLinkService: {init: jasmine.Spy};

  beforeEach(async () => {
    deepLinkService = {init: jasmine.createSpy('init').and.resolveTo(undefined)};

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([]),
        {provide: DeepLinkService, useValue: deepLinkService},
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create the app', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('inits deep links once the platform is ready', () => {
    expect(deepLinkService.init).toHaveBeenCalledOnceWith();
  });
});
