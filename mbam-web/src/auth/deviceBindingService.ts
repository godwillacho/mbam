const DEVICE_ID_STORAGE_KEY = "mbam-device-id";
const DEVICE_COOKIE_NAME = "mbam_device_hint";

export interface DeviceBinding {
  deviceId: string;
  fingerprintHash: string;
  deviceLabel: string;
}

function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "server-render-device";
  const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (existing) return existing;
  const next = crypto.randomUUID();
  window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, next);
  return next;
}

function base64Url(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function deviceFingerprintSource(): string {
  if (typeof navigator === "undefined") return "server";
  const screenParts = typeof screen === "undefined"
    ? []
    : [screen.width, screen.height, screen.colorDepth, screen.pixelDepth];
  return [
    navigator.userAgent,
    navigator.language,
    navigator.platform,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    ...screenParts,
  ].join("|");
}

function deviceLabel(): string {
  if (typeof navigator === "undefined") return "Unknown device";
  const platform = navigator.platform || "browser";
  const mobile = /Mobi|Android/i.test(navigator.userAgent) ? "Mobile" : "Desktop";
  return `${mobile} ${platform}`.trim();
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64Url(digest);
}

function persistDeviceHintCookie(binding: DeviceBinding): void {
  if (typeof document === "undefined") return;
  const secure = location.protocol === "https:" ? "; Secure" : "";
  const maxAge = 60 * 60 * 24 * 30;
  const value = encodeURIComponent(`${binding.deviceId}.${binding.fingerprintHash}`);
  document.cookie = `${DEVICE_COOKIE_NAME}=${value}; Path=/; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

export async function getDeviceBinding(): Promise<DeviceBinding> {
  const binding = {
    deviceId: getOrCreateDeviceId(),
    fingerprintHash: await sha256(deviceFingerprintSource()),
    deviceLabel: deviceLabel(),
  };
  persistDeviceHintCookie(binding);
  return binding;
}

export async function assertCurrentDeviceBinding(expected: DeviceBinding): Promise<void> {
  const current = await getDeviceBinding();
  if (
    current.deviceId !== expected.deviceId ||
    current.fingerprintHash !== expected.fingerprintHash
  ) {
    throw new Error("offline_device_binding_mismatch");
  }
}
