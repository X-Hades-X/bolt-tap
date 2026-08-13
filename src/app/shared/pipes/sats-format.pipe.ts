import {Pipe, PipeTransform} from '@angular/core';

/**
 * Formats a satoshi amount with a space as thousands separator.
 * Users only ever see whole sats; msat stays an internal detail.
 * Example: 5000 -> "5 000", 21 -> "21"
 */
@Pipe({
  name: 'satsFormat',
  standalone: true,
})
export class SatsFormatPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return '0';
    }
    const wholeSats = Math.floor(value);
    return wholeSats.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }
}
