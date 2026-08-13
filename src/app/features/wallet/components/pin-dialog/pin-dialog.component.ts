import {Component, inject} from '@angular/core';
import {CommonModule} from '@angular/common';
import {IonContent, ModalController} from '@ionic/angular/standalone';
import {NumpadComponent} from '../../../../shared/components/numpad/numpad.component';

/**
 * Bottom-sheet PIN entry with a custom numpad. Four dots fill as digits are
 * entered; auto-submits on the 4th digit. No native input, so password
 * managers never prompt to save the PIN.
 */
@Component({
  selector: 'app-pin-dialog',
  templateUrl: './pin-dialog.component.html',
  styleUrls: ['./pin-dialog.component.scss'],
  standalone: true,
  imports: [CommonModule, IonContent, NumpadComponent],
})
export class PinDialogComponent {
  private readonly _modalCtrl = inject(ModalController);

  protected readonly pinLength = 4;
  protected pin = '';

  get pinDigits(): boolean[] {
    return Array.from({length: this.pinLength}, (_, i) => i < this.pin.length);
  }

  get hasValue(): boolean {
    return this.pin.length > 0;
  }

  onDigit(d: string) {
    if (this.pin.length >= this.pinLength) {
      return;
    }
    this.pin += d;
    if (this.pin.length === this.pinLength) {
      // Auto-submit once complete
      void this._modalCtrl.dismiss(this.pin, 'confirm');
    }
  }

  onBackspace() {
    this.pin = this.pin.slice(0, -1);
  }

  dismiss() {
    void this._modalCtrl.dismiss(null, 'cancel');
  }
}
