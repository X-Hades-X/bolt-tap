import {ComponentFixture, TestBed} from '@angular/core/testing';
import {NumpadComponent} from './numpad.component';

describe('NumpadComponent', () => {
  let component: NumpadComponent;
  let fixture: ComponentFixture<NumpadComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NumpadComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(NumpadComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('creates', () => {
    expect(component).toBeTruthy();
  });

  it('emits digits', () => {
    spyOn(component.digit, 'emit');
    component.onDigit('5');
    expect(component.digit.emit).toHaveBeenCalledWith('5');
  });

  it('emits backspace', () => {
    spyOn(component.backspace, 'emit');
    component.onBackspace();
    expect(component.backspace.emit).toHaveBeenCalled();
  });

  it('shows backspace only when hasValue', () => {
    component.hasValue = false;
    fixture.detectChanges();
    let btn = fixture.nativeElement.querySelector('.numpad-key--action');
    expect(btn).toBeNull();

    component.hasValue = true;
    fixture.detectChanges();
    btn = fixture.nativeElement.querySelector('.numpad-key--action');
    expect(btn).toBeTruthy();
  });
});
