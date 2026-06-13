export function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

export function readFileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(arrayBufferToBase64(fr.result as ArrayBuffer));
    fr.onerror = () => reject(fr.error ?? new Error('read_failed'));
    fr.readAsArrayBuffer(file);
  });
}

export function utf8ToBase64(s: string): string {
  const bytes = encodeURIComponent(s).replace(/%([0-9A-Fa-f]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16)));
  return btoa(bytes);
}

export function base64ToUtf8(b64: string): string {
  try {
    const bin = atob(b64);
    let pct = '';
    for (let i = 0; i < bin.length; i++) pct += '%' + ('0' + bin.charCodeAt(i).toString(16)).slice(-2);
    return decodeURIComponent(pct);
  } catch {
    return '';
  }
}
