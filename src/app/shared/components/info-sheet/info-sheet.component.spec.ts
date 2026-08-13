import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalController } from '@ionic/angular/standalone';

import { InfoSheetComponent } from './info-sheet.component';

describe('InfoSheetComponent', () => {
  let component: InfoSheetComponent;
  let fixture: ComponentFixture<InfoSheetComponent>;
  let modalCtrlSpy: jasmine.SpyObj<ModalController>;

  beforeEach(async () => {
    modalCtrlSpy = jasmine.createSpyObj('ModalController', ['dismiss']);

    await TestBed.configureTestingModule({
      imports: [InfoSheetComponent],
      providers: [{ provide: ModalController, useValue: modalCtrlSpy }],
    }).compileComponents();

    fixture = TestBed.createComponent(InfoSheetComponent);
    component = fixture.componentInstance;
    component.title = 'Test title';
    component.sections = [
      { heading: 'First', text: 'First body' },
      { text: 'Headingless body' },
    ];
    fixture.detectChanges();
  });

  it('renders the title and all sections, skipping missing headings', () => {
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('.info-sheet__title')?.textContent).toContain('Test title');

    const headings = el.querySelectorAll('.info-sheet__heading');
    expect(headings.length).toBe(1);
    expect(headings[0].textContent).toContain('First');

    const texts = el.querySelectorAll('.info-sheet__text');
    expect(texts.length).toBe(2);
    expect(texts[1].textContent).toContain('Headingless body');
  });

  it('shows a single ghost Close button by default', () => {
    const buttons: NodeListOf<HTMLButtonElement> = fixture.nativeElement.querySelectorAll('.info-sheet__buttons button');

    expect(buttons.length).toBe(1);
    expect(buttons[0].textContent).toContain('Close');
    expect(buttons[0].classList.contains('app-button--ghost')).toBeTrue();
  });

  it('dismisses with the tapped button role', () => {
    component.buttons = [
      { text: 'Skip', role: 'cancel', style: 'ghost' },
      { text: 'Go', role: 'confirm' },
    ];
    fixture.detectChanges();

    const buttons: NodeListOf<HTMLButtonElement> = fixture.nativeElement.querySelectorAll('.info-sheet__buttons button');
    buttons[1].click();

    expect(modalCtrlSpy.dismiss).toHaveBeenCalledWith(null, 'confirm');
  });

  it('dismisses with cancel from the default Close button', () => {
    const closeButton: HTMLButtonElement = fixture.nativeElement.querySelector('.info-sheet__buttons button');
    closeButton.click();

    expect(modalCtrlSpy.dismiss).toHaveBeenCalledWith(null, 'cancel');
  });
});
