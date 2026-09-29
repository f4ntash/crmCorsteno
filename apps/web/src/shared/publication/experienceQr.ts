import QRCode from 'qrcode';

type QrGenerator = (publicUrl: string, options: { width: number; margin: number }) => Promise<string>;

export function generateExperienceQr(publicUrl: string, generate: QrGenerator = QRCode.toDataURL) {
  return generate(publicUrl, { width: 320, margin: 2 });
}
