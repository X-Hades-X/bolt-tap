import {Component, inject, Input} from '@angular/core';
import {ModalController} from '@ionic/angular/standalone';

/** One block of body text in an info sheet; the heading is optional. */
export interface InfoSection {
  heading?: string;
  text: string;
}

/** Bottom action; the sheet dismisses with this role (caller decides via onWillDismiss). */
export interface InfoButton {
  text: string;
  role: string;
  /** Filled orange by default; 'ghost' for secondary/dismissive actions. */
  style?: 'primary' | 'ghost';
}

/**
 * Bottom-sheet info/action panel — the app's single popup language (settings
 * explanations, print feedback, prompts). Title + headed text sections +
 * role-dismissing buttons; the backdrop dismisses with 'cancel'. Presented
 * as an auto-height bottom-anchored modal (no drag handle — every sheet has
 * an explicit close/action button). Pure UI and deliberately BLE-free so the
 * noble build can swap printer components without touching this.
 *
 * NOTE: the root is a plain div, NOT ion-content — ion-content sizes itself
 * from its parent (its scroll area is absolutely positioned), which would
 * collapse the auto-height modal to 0px. Here the body region scrolls via
 * plain overflow-y once the sheet hits its max height.
 */
@Component({
  selector: 'app-info-sheet',
  templateUrl: './info-sheet.component.html',
  styleUrls: ['./info-sheet.component.scss'],
  standalone: true,
})
export class InfoSheetComponent {
  private readonly _modalCtrl = inject(ModalController);

  /** Sheet heading. */
  @Input({required: true}) title!: string;
  /** Body sections, rendered in order. */
  @Input() sections: InfoSection[] = [];
  /** Bottom actions; defaults to a single ghost Close. */
  @Input() buttons: InfoButton[] = [{text: 'Close', role: 'cancel', style: 'ghost'}];

  dismiss(role = 'cancel') {
    void this._modalCtrl.dismiss(null, role);
  }
}
