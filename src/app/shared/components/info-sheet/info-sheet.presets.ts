import {InfoSection} from './info-sheet.component';

/** Ready-made sheet content: pass straight into componentProps. */
export interface InfoSheetContent {
  title: string;
  sections: InfoSection[];
}

/**
 * "Presigned vouchers" explanation — shown from the settings info icon and
 * automatically the first time the toggle is switched on.
 */
export const PRESIGN_INFO: InfoSheetContent = {
  title: 'Presigned vouchers',
  sections: [
    {
      heading: 'What it does',
      text: 'Send turns a card payment into a voucher: the backend pre-signs a brand-new withdraw link for exactly the amount you enter, shown as a printable QR code. Whoever redeems that link gets the sats — no card and no PIN needed at redeem time.',
    },
    {
      heading: 'The QR is the money',
      text: 'A voucher is a bearer instrument: anyone who scans the printed QR can claim the funds. Treat a printed voucher like cash — it cannot be revoked.',
    },
    {
      heading: 'Custom backend required',
      text: 'Presigning is not standard LNURL. It only works with the LNbits boltcards fork, branch feature/pin_presign: github.com/X-Hades-X/boltcards/tree/feature/pin_presign — stock LNbits does not have this extension.',
    },
    {
      heading: 'Fallback',
      text: 'Default is off. Enabled against a stock backend, nothing breaks: the app detects the missing support and Send silently falls back to plain tap-to-pay (no printable voucher).',
    },
    {
      heading: 'PIN',
      text: 'Above the card\'s PIN threshold, the PIN is verified up front when the voucher is created.',
    },
  ],
};

/**
 * "Printer (experimental)" explanation — shown from the settings info icon
 * and automatically before the first printer connection.
 */
export const PRINTER_INFO: InfoSheetContent = {
  title: 'Printer (experimental)',
  sections: [
    {
      heading: 'Alpha feature',
      text: 'Printing is experimental and has quirks — for example, the first label after every connect comes out empty, which is why the app offers a throwaway test print on connect.',
    },
    {
      heading: 'Supported hardware',
      text: 'Built and tested against the Niimbot D110 only. Other Niimbot models accepting the same "D110" print task might work but are untested; non-Niimbot printers will not work.',
    },
    {
      heading: 'One label format',
      text: 'The layout is hard-coded for a single label size (384 px printhead width, round template). Other label sizes or shapes will misprint.',
    },
    {
      heading: 'Unofficial protocol',
      text: 'Printing speaks Niimbot\'s proprietary BLE protocol via @mmote/niimbluelib, a reverse-engineered third-party library — not provided or endorsed by Niimbot, merely tolerated. Any firmware update could break it.',
    },
    {
      heading: 'Privacy',
      text: 'Printing here is fully local: no account, no cloud, nothing leaves your phone. Be cautious if you later reconnect the printer to Niimbot\'s official app: data the printer stores locally (like label counters) appears to sync back to their servers — and once a counter marks a label roll as used up, the printer may refuse to print from that roll.',
    },
  ],
};
