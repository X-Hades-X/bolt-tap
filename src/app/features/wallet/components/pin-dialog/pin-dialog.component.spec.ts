import {ComponentFixture, TestBed, waitForAsync} from '@angular/core/testing';
import {ModalController} from '@ionic/angular/standalone';
import {PinDialogComponent} from './pin-dialog.component';

describe('PinDialogComponent', () => {
  let component: PinDialogComponent;
  let fixture: ComponentFixture<PinDialogComponent>;
  let modalCtrlSpy: jasmine.SpyObj<ModalController>;

  beforeEach(waitForAsync(() => {
    modalCtrlSpy = jasmine.createSpyObj('ModalController', ['dismiss']);

    TestBed.configureTestingModule({
      imports: [PinDialogComponent],
      providers: [
        {provide: ModalController, useValue: modalCtrlSpy},
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PinDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start with empty pin and no filled dots', () => {
    expect(component['pin']).toBe('');
    expect(component.hasValue).toBeFalse();
    expect(component.pinDigits).toEqual([false, false, false, false]);
  });

  it('fills dots as digits are entered', () => {
    component.onDigit('1');
    component.onDigit('2');
    expect(component['pin']).toBe('12');
    expect(component.pinDigits).toEqual([true, true, false, false]);
  });

  it('auto-submits on the 4th digit', () => {
    component.onDigit('1');
    component.onDigit('2');
    component.onDigit('3');
    component.onDigit('4');
    expect(modalCtrlSpy.dismiss).toHaveBeenCalledWith('1234', 'confirm');
  });

  it('ignores digits beyond the pin length', () => {
    component.onDigit('1');
    component.onDigit('2');
    component.onDigit('3');
    // 4th triggers dismiss; a 5th must not change anything
    component.onDigit('4');
    component.onDigit('9');
    expect(component['pin']).toBe('1234');
  });

  it('backspace removes the last digit', () => {
    component.onDigit('1');
    component.onDigit('2');
    component.onBackspace();
    expect(component['pin']).toBe('1');
    expect(component.pinDigits).toEqual([true, false, false, false]);
  });

  it('dismisses with null on cancel', () => {
    component.dismiss();
    expect(modalCtrlSpy.dismiss).toHaveBeenCalledWith(null, 'cancel');
  });
});
