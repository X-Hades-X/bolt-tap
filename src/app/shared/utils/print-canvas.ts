import QRCode from 'qrcode';

/** Final label edge length in pixels (D110 printhead width). */
const LABEL_SIZE = 384;
/** QR edge length on the printed label. */
const QR_SIZE = 280;

function loadTemplate(): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = 'assets/images/template_round.png';
  });
}

/**
 * Composes the printable label: the round template with the QR centered.
 * Falls back to a plain white background when the template asset fails to
 * load.
 */
export async function composeLabelCanvas(qrCanvas: HTMLCanvasElement): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = LABEL_SIZE;
  canvas.height = LABEL_SIZE;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get 2d canvas context.');
  }

  const template = await loadTemplate();
  if (template) {
    ctx.drawImage(template, 0, 0, LABEL_SIZE, LABEL_SIZE);
  } else {
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, LABEL_SIZE, LABEL_SIZE);
  }

  const offset = (LABEL_SIZE - QR_SIZE) / 2;
  ctx.drawImage(qrCanvas, 0, 0, qrCanvas.width, qrCanvas.height, offset, offset, QR_SIZE, QR_SIZE);
  return canvas;
}

/** Builds a complete label from raw QR data (used for the test print). */
export async function buildLabelCanvas(qrData: string): Promise<HTMLCanvasElement> {
  const qrCanvas = document.createElement('canvas');
  await QRCode.toCanvas(qrCanvas, qrData, {width: QR_SIZE, margin: 2});
  return composeLabelCanvas(qrCanvas);
}
