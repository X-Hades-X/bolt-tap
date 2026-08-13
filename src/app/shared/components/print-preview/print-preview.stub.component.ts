import {Component} from '@angular/core';

/**
 * Build-variant stub used by the "noble" (no-Bluetooth) build: renders
 * nothing at the settings page's printer slot and the invoice page's
 * print area. Swapped in via angular.json fileReplacements; must keep the
 * same selector as print-preview.component.ts.
 */
@Component({
  selector: 'app-print-preview-page',
  template: '',
  standalone: true,
})
export class PrintPreviewComponent {
}
