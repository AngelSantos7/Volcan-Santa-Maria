import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

export type AppLanguage = 'es' | 'en'

const LANGUAGE_STORAGE_KEY = 'volcan-santa-maria-language'

const resources = {
  es: {
    translation: {
      common: {
        brand: 'Volcán Santa María',
        email: 'Correo electrónico',
        password: 'Contraseña',
        firstName: 'Nombre',
        lastName: 'Apellido',
        phone: 'Teléfono',
        cancel: 'Cancelar',
        signOut: 'Cerrar sesión',
        signingOut: 'Cerrando sesión…',
        unavailable: 'No disponible',
        language: 'Idioma',
      },
      auth: {
        checkingSession: 'Verificando sesión…',
        loginTitle: 'Iniciar sesión',
        loginSubtitle: 'Ingresa con tu correo electrónico para continuar.',
        loginSubmit: 'Ingresar',
        loggingIn: 'Ingresando…',
        noAccount: '¿Aún no tienes una cuenta?',
        createAccountLink: 'Crear cuenta',
        registerTitle: 'Crear cuenta',
        registerSubtitle: 'Regístrate para comenzar tu experiencia.',
        confirmPassword: 'Confirmar contraseña',
        creatingAccount: 'Creando cuenta…',
        alreadyRegistered: '¿Ya tienes una cuenta?',
        loginLink: 'Iniciar sesión',
        confirmationRequired:
          'Cuenta creada. Revisa tu correo y confirma la cuenta antes de iniciar sesión.',
        activeSession: 'Sesión activa',
        welcome: '¡Bienvenido, {{name}}!',
        welcomeGeneric: '¡Bienvenido!',
        authenticated: 'Tu cuenta está autenticada correctamente.',
        editProfile: 'Editar perfil',
      },
      profile: {
        loading: 'Cargando perfil…',
        loadErrorTitle: 'No pudimos cargar tu perfil',
        loadErrorSubtitle: 'Revisa tu conexión y vuelve a intentarlo.',
        retry: 'Reintentar',
        completeTitle: 'Completa tu perfil',
        editTitle: 'Editar perfil',
        subtitle:
          'Comparte únicamente la información esencial para identificarte y atender una emergencia.',
        personalInformation: 'Información personal',
        nationality: 'Nacionalidad',
        dateOfBirth: 'Fecha de nacimiento',
        documentType: 'Tipo de documento',
        documentNumber: 'Número de documento',
        emergencyContact: 'Contacto de emergencia',
        relationship: 'Parentesco',
        selectOption: 'Selecciona una opción',
        documentTypes: {
          dpi: 'DPI / CUI',
          passport: 'Pasaporte',
          other: 'Otro',
        },
        save: 'Guardar perfil',
        saving: 'Guardando…',
      },
      country: {
        search: 'Escribe para buscar un país',
        noResults: 'No se encontraron países',
      },
      phone: {
        countryPrefix: 'País y prefijo telefónico',
        localNumber: 'Número local',
      },
      validation: {
        required: 'Completa todos los campos.',
        invalidEmail: 'Ingresa un correo electrónico válido.',
        passwordLength: 'La contraseña debe tener al menos 8 caracteres.',
        passwordMismatch: 'Las contraseñas no coinciden.',
        invalidDate: 'Ingresa una fecha de nacimiento válida y razonable.',
        invalidPhone: 'Ingresa un teléfono válido para el país seleccionado.',
        invalidEmergencyPhone:
          'Ingresa un teléfono válido para el contacto de emergencia.',
        saveProfile: 'No se pudo guardar el perfil. Inténtalo de nuevo.',
      },
      errors: {
        invalidCredentials: 'El correo o la contraseña no son correctos.',
        emailNotConfirmed:
          'Confirma tu correo electrónico antes de iniciar sesión.',
        accountCreation: 'No fue posible crear la cuenta con ese correo.',
        weakPassword: 'La contraseña no cumple los requisitos de seguridad.',
        rateLimit:
          'Se realizaron demasiados intentos. Espera un momento y vuelve a intentarlo.',
        signupDisabled: 'El registro no está disponible en este momento.',
        network:
          'No se pudo conectar con el servicio. Revisa tu conexión e inténtalo de nuevo.',
        generic: 'Ocurrió un problema con la autenticación. Inténtalo de nuevo.',
      },
    },
  },
  en: {
    translation: {
      common: {
        brand: 'Santa María Volcano',
        email: 'Email address',
        password: 'Password',
        firstName: 'First name',
        lastName: 'Last name',
        phone: 'Phone',
        cancel: 'Cancel',
        signOut: 'Sign out',
        signingOut: 'Signing out…',
        unavailable: 'Unavailable',
        language: 'Language',
      },
      auth: {
        checkingSession: 'Checking session…',
        loginTitle: 'Sign in',
        loginSubtitle: 'Enter your email address to continue.',
        loginSubmit: 'Sign in',
        loggingIn: 'Signing in…',
        noAccount: "Don't have an account yet?",
        createAccountLink: 'Create account',
        registerTitle: 'Create account',
        registerSubtitle: 'Sign up to begin your experience.',
        confirmPassword: 'Confirm password',
        creatingAccount: 'Creating account…',
        alreadyRegistered: 'Already have an account?',
        loginLink: 'Sign in',
        confirmationRequired:
          'Account created. Check your email and confirm your account before signing in.',
        activeSession: 'Active session',
        welcome: 'Welcome, {{name}}!',
        welcomeGeneric: 'Welcome!',
        authenticated: 'Your account is authenticated.',
        editProfile: 'Edit profile',
      },
      profile: {
        loading: 'Loading profile…',
        loadErrorTitle: 'We could not load your profile',
        loadErrorSubtitle: 'Check your connection and try again.',
        retry: 'Try again',
        completeTitle: 'Complete your profile',
        editTitle: 'Edit profile',
        subtitle:
          'Share only the essential information needed to identify you and assist in an emergency.',
        personalInformation: 'Personal information',
        nationality: 'Nationality',
        dateOfBirth: 'Date of birth',
        documentType: 'Document type',
        documentNumber: 'Document number',
        emergencyContact: 'Emergency contact',
        relationship: 'Relationship',
        selectOption: 'Select an option',
        documentTypes: {
          dpi: 'DPI / CUI',
          passport: 'Passport',
          other: 'Other',
        },
        save: 'Save profile',
        saving: 'Saving…',
      },
      country: {
        search: 'Type to search for a country',
        noResults: 'No countries found',
      },
      phone: {
        countryPrefix: 'Phone country and calling code',
        localNumber: 'Local number',
      },
      validation: {
        required: 'Complete all fields.',
        invalidEmail: 'Enter a valid email address.',
        passwordLength: 'The password must be at least 8 characters long.',
        passwordMismatch: 'The passwords do not match.',
        invalidDate: 'Enter a valid and reasonable date of birth.',
        invalidPhone: 'Enter a valid phone number for the selected country.',
        invalidEmergencyPhone:
          'Enter a valid phone number for the emergency contact.',
        saveProfile: 'The profile could not be saved. Try again.',
      },
      errors: {
        invalidCredentials: 'The email or password is incorrect.',
        emailNotConfirmed: 'Confirm your email address before signing in.',
        accountCreation: 'The account could not be created with that email.',
        weakPassword: 'The password does not meet the security requirements.',
        rateLimit: 'Too many attempts. Wait a moment and try again.',
        signupDisabled: 'Registration is not available right now.',
        network: 'Could not connect to the service. Check your connection and try again.',
        generic: 'There was an authentication problem. Try again.',
      },
    },
  },
} as const

function normalizeLanguage(value: string | null | undefined): AppLanguage {
  return value?.toLowerCase().startsWith('en') ? 'en' : 'es'
}

function getInitialLanguage(): AppLanguage {
  try {
    const storedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
    if (storedLanguage === 'es' || storedLanguage === 'en') {
      return storedLanguage
    }
  } catch {
    // Language persistence is optional when browser storage is unavailable.
  }

  return normalizeLanguage(window.navigator.language)
}

void i18n.use(initReactI18next).init({
  resources,
  lng: getInitialLanguage(),
  fallbackLng: 'es',
  supportedLngs: ['es', 'en'],
  load: 'languageOnly',
  initAsync: false,
  interpolation: { escapeValue: false },
})

i18n.on('languageChanged', (language) => {
  try {
    window.localStorage.setItem(
      LANGUAGE_STORAGE_KEY,
      normalizeLanguage(language),
    )
  } catch {
    // The application still works when language preference cannot be persisted.
  }
})

export function getAppLanguage(language = i18n.resolvedLanguage): AppLanguage {
  return normalizeLanguage(language)
}

export default i18n
