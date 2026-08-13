import {Component, EventEmitter, Input, Output} from '@angular/core';
import {CommonModule} from '@angular/common';
import {IonIcon} from '@ionic/angular/standalone';
import {addIcons} from 'ionicons';
import {backspaceOutline} from 'ionicons/icons';

/**
 * Custom numeric keypad. Emits events only; the parent owns the value state.
 * Round outlined buttons in the reference style.
 */
@Component({
  selector: 'app-numpad',
  templateUrl: './numpad.component.html',
  styleUrls: ['./numpad.component.scss'],
  standalone: true,
  imports: [CommonModule, IonIcon],
})
export class NumpadComponent {
  /** Whether the backspace key is shown (typically once there's input). */
  @Input() hasValue = false;

  @Output() digit = new EventEmitter<string>();
  @Output() backspace = new EventEmitter<void>();

  readonly rows: string[][] = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
  ];

  constructor() {
    addIcons({backspaceOutline});
  }

  onDigit(d: string) {
    this.digit.emit(d);
  }

  onBackspace() {
    this.backspace.emit();
  }
}
