export function getAuthErrorMessage(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : ''

  switch (code) {
    case 'invalid_credentials':
      return 'El correo o la contraseña no son correctos.'
    case 'email_not_confirmed':
      return 'Confirma tu correo electrónico antes de iniciar sesión.'
    case 'user_already_exists':
    case 'email_exists':
      return 'No fue posible crear la cuenta con ese correo.'
    case 'weak_password':
      return 'La contraseña no cumple los requisitos de seguridad.'
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Se realizaron demasiados intentos. Espera un momento y vuelve a intentarlo.'
    case 'signup_disabled':
      return 'El registro no está disponible en este momento.'
    default:
      return error instanceof TypeError
        ? 'No se pudo conectar con el servicio. Revisa tu conexión e inténtalo de nuevo.'
        : 'Ocurrió un problema con la autenticación. Inténtalo de nuevo.'
  }
}
