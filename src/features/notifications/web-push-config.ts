export function isWebPushEnabled(value: unknown): boolean {
  return typeof value === 'string' && value.trim().toLowerCase() === 'true';
}

function configuredValue(): unknown {
  return import.meta.env?.VITE_WEB_PUSH_ENABLED;
}

export function webPushEnabled(): boolean {
  return isWebPushEnabled(configuredValue());
}

export async function runWhenWebPushEnabled<T>(
  operation: () => Promise<T>,
  value: unknown = configuredValue()
): Promise<T> {
  if (!isWebPushEnabled(value)) throw new Error('disabled');
  return operation();
}
