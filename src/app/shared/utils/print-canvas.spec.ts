import { buildLabelCanvas, composeLabelCanvas } from './print-canvas';

describe('print-canvas', () => {
  it('builds a 384x384 label from raw QR data', async () => {
    const canvas = await buildLabelCanvas('test');

    expect(canvas.width).toBe(384);
    expect(canvas.height).toBe(384);
  });

  it('composes an existing QR canvas onto the label', async () => {
    const qrCanvas = document.createElement('canvas');
    qrCanvas.width = 280;
    qrCanvas.height = 280;

    const canvas = await composeLabelCanvas(qrCanvas);

    expect(canvas.width).toBe(384);
    expect(canvas.height).toBe(384);
  });
});
