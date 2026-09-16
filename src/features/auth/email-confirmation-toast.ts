function getRedirectParameterSets(href: string): URLSearchParams[] {
  const url = new URL(href);
  const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;

  return [url.searchParams, new URLSearchParams(hash)];
}

export function isEmailConfirmationRedirect(href: string): boolean {
  const parameterSets = getRedirectParameterSets(href);
  const hasError = parameterSets.some(
    (parameters) =>
      parameters.has('error') ||
      parameters.has('error_code') ||
      parameters.has('error_description')
  );

  if (hasError) return false;

  return parameterSets.some(
    (parameters) =>
      parameters.get('type') === 'signup' &&
      (parameters.has('access_token') || parameters.has('code'))
  );
}

export function clearEmailConfirmationRedirectMarker(): void {
  const url = new URL(window.location.href);
  let changed = false;

  if (url.searchParams.get('type') === 'signup') {
    url.searchParams.delete('type');
    changed = true;
  }

  const hashParameters = new URLSearchParams(
    url.hash.startsWith('#') ? url.hash.slice(1) : url.hash
  );
  if (hashParameters.get('type') === 'signup') {
    hashParameters.delete('type');
    url.hash = hashParameters.toString();
    changed = true;
  }

  if (changed) {
    window.history.replaceState(window.history.state, '', url);
  }
}
