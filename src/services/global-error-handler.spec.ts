import {TestBed} from '@angular/core/testing';
import {HttpErrorResponse} from '@angular/common/http';
import {ToastController} from '@ionic/angular';
import {GlobalErrorHandler} from './global-error-handler';

describe('GlobalErrorHandler', () => {
  let handler: GlobalErrorHandler;
  let toastCreate: jasmine.Spy;

  beforeEach(() => {
    toastCreate = jasmine.createSpy('create').and.returnValue(
      Promise.resolve({present: () => Promise.resolve(true)})
    );

    TestBed.configureTestingModule({
      providers: [
        GlobalErrorHandler,
        {provide: ToastController, useValue: {create: toastCreate}},
      ],
    });
    handler = TestBed.inject(GlobalErrorHandler);
    spyOn(console, 'error');
  });

  function shownMessage(): string {
    return toastCreate.calls.mostRecent().args[0].message;
  }

  it('shows the message of plain errors', () => {
    handler.handleError(new Error('Something broke'));

    expect(shownMessage()).toBe('Something broke');
  });

  it('never shows HttpErrorResponse details (URL may contain k1/PIN)', () => {
    const httpError = new HttpErrorResponse({
      status: 400,
      statusText: 'Bad Request',
      url: 'https://example.com/callback?k1=secret-k1&pin=1234',
    });

    handler.handleError(httpError);

    expect(shownMessage()).toBe('Network request failed. Please try again.');
    expect(shownMessage()).not.toContain('secret-k1');
    expect(console.error).toHaveBeenCalledWith('Global Error: HTTP 400 Bad Request');
  });

  it('sanitizes error messages that contain a URL', () => {
    handler.handleError(new Error('Request failed for https://example.com/callback?k1=secret-k1'));

    expect(shownMessage()).toBe('Network request failed. Please try again.');
    expect(shownMessage()).not.toContain('secret-k1');
  });

  it('falls back to a generic message for unknown shapes', () => {
    handler.handleError({noMessageHere: true});

    expect(shownMessage()).toBe('An unexpected error occurred');
  });

  it('handles wrapped message-only objects', () => {
    handler.handleError({message: 'Plain failure'});

    expect(shownMessage()).toBe('Plain failure');
  });
});
