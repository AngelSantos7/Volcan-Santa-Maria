import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

export type AppLanguage = 'es' | 'en';

const LANGUAGE_STORAGE_KEY = 'volcan-santa-maria-language';

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
      visits: {
        loading: 'Buscando tu ascenso activo…',
        title: 'Ascenso al Volcán Santa María',
        subtitle: 'Crea un grupo o ingresa el código que te compartieron.',
        back: '← Volver',
        route: 'Ruta',
        summitRoute: 'Ascenso a la Cima',
        tripType: 'Tipo de ascenso',
        types: {
          day_hike: 'Ascenso de un día',
          expedition_camping: 'Expedición y campamento',
        },
        expectedReturn: 'Retorno estimado',
        returnDate: 'Fecha estimada de regreso',
        returnTime: 'Hora estimada de regreso',
        localGuide: 'Guía local',
        guideName: 'Nombre del guía',
        participants: 'Participantes',
        organizer: 'Organizador',
        memberStatus: {
          active: 'En recorrido',
          returning_early: 'Regresando antes',
          returned_early: 'Retorno anticipado confirmado',
          completed: 'Completó el ascenso',
          withdrawn_before_start: 'Se retiró antes de iniciar',
        },
        members: {
          withdraw: 'Retirarme del grupo',
          withdrawConfirm:
            '¿Confirmas que deseas retirarte de este grupo antes de iniciar?',
          remove: 'Retirar del grupo',
          removeConfirm:
            '¿Retirar a {{name}} del grupo? Su registro se conservará en el historial.',
          markEarlyReturn: 'Registrar retorno anticipado',
        },
        earlyReturn: {
          action: 'Necesito regresar antes',
          title: 'Finalizar mi participación antes',
          organizerTitle: 'Retorno anticipado de {{name}}',
          reason: 'Motivo',
          selectReason: 'Selecciona un motivo',
          reasons: {
            physical_discomfort: 'Malestar físico',
            injury: 'Lesión',
            emergency: 'Emergencia',
            personal_decision: 'Decisión personal',
            other: 'Otro',
          },
          notes: 'Observaciones opcionales',
          reasonRequired: 'Selecciona un motivo para continuar.',
          confirm: 'Iniciar mi regreso',
          organizerConfirm: 'Registrar regreso',
          saving: 'Guardando…',
          checkout: 'Ya llegué al punto de control',
          checkoutConfirm: '¿Confirmas que ya llegaste al punto de control?',
        },
        history: {
          title: 'Historial de ascensos',
          loading: 'Cargando historial…',
          empty: 'Aún no tienes ascensos en tu historial.',
          individual: 'Individual',
          group: 'Grupal',
          groupOrganizer: 'Grupal · Organizador',
          loadMore: 'Cargar más',
          loadingMore: 'Cargando…',
          status: {
            active: 'En curso',
            returningEarly: 'Regresando antes',
            returnedEarly: 'Retorno anticipado',
            withdrawn: 'Se retiró antes de iniciar',
            completed: 'Completado',
            cancelled: 'Cancelado',
          },
        },
        terms:
          'He leído y acepto las normas y recomendaciones para realizar el ascenso.',
        create: {
          action: 'Crear ascenso',
          title: 'Crear ascenso',
          localGuideQuestion: '¿Viajas con guía local?',
          submit: 'Crear grupo',
          creating: 'Creando grupo…',
        },
        join: {
          action: 'Unirme a un grupo',
          title: 'Unirme a un grupo',
          code: 'Código del grupo',
          submit: 'Unirme al grupo',
          joining: 'Uniéndome…',
        },
        group: {
          preparing: 'En preparación',
          title: 'Grupo para el ascenso',
          code: 'Código',
          copyCode: 'Copiar código',
          share: 'Compartir código',
          codeCopied: 'Código copiado.',
          shared: 'Código compartido.',
          shareCopied: 'Invitación copiada para compartir.',
          shareText: 'Únete a mi grupo para {{route}}. Código: {{code}}',
        },
        start: {
          slide: 'Desliza para iniciar',
          starting: 'Iniciando…',
        },
        inProgress: {
          status: 'En curso',
          title: 'Ascenso en curso',
          startedAt: 'Hora de inicio',
          route: 'Ver ruta',
          map: 'Mapa',
          references: 'Referencias',
          futureFeature: '{{feature}} se implementará posteriormente.',
        },
        cancel: {
          action: 'Cancelar ascenso',
          cancelling: 'Cancelando…',
          confirm:
            '¿Cancelar este ascenso? El grupo dejará de estar disponible.',
        },
        complete: {
          action: 'Finalizar ascenso',
          completing: 'Finalizando…',
          confirm: '¿Confirmas que el grupo ha finalizado el ascenso?',
          completed: 'Finalizado',
          title: 'Ascenso finalizado',
          back: 'Volver al inicio',
        },
        validation: {
          futureReturn: 'Selecciona una fecha y hora de regreso futuras.',
          guideName: 'Ingresa el nombre del guía local.',
          acceptTerms: 'Debes aceptar las normas y recomendaciones.',
          invalidCode: 'Ingresa un código válido de 6 caracteres.',
        },
        errors: {
          loadTitle: 'No pudimos cargar tu ascenso',
          alreadyActive: 'Ya perteneces a un ascenso activo.',
          codeNotFound: 'No encontramos un grupo con ese código.',
          notAccepting: 'Ese grupo ya no acepta integrantes.',
          profileRequired: 'Completa tu perfil antes de continuar.',
          accessDenied: 'No tienes acceso a ese grupo.',
          copyFailed: 'No se pudo copiar el código.',
          shareFailed: 'No se pudo compartir el código.',
          generic: 'No se pudo completar la acción. Inténtalo de nuevo.',
        },
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
        generic:
          'Ocurrió un problema con la autenticación. Inténtalo de nuevo.',
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
      visits: {
        loading: 'Looking for your active ascent…',
        title: 'Santa María Volcano Ascent',
        subtitle: 'Create a group or enter the code shared with you.',
        back: '← Back',
        route: 'Route',
        summitRoute: 'Summit Ascent',
        tripType: 'Trip type',
        types: {
          day_hike: 'Day Hike',
          expedition_camping: 'Expedition & Camping',
        },
        expectedReturn: 'Estimated return',
        returnDate: 'Estimated return date',
        returnTime: 'Estimated return time',
        localGuide: 'Local guide',
        guideName: 'Guide name',
        participants: 'Participants',
        organizer: 'Organizer',
        memberStatus: {
          active: 'On route',
          returning_early: 'Returning early',
          returned_early: 'Early return confirmed',
          completed: 'Completed',
          withdrawn_before_start: 'Withdrew before start',
        },
        members: {
          withdraw: 'Leave group',
          withdrawConfirm:
            'Do you confirm that you want to leave this group before it starts?',
          remove: 'Remove from group',
          removeConfirm:
            'Remove {{name}} from the group? Their history record will be kept.',
          markEarlyReturn: 'Record early return',
        },
        earlyReturn: {
          action: 'I need to return early',
          title: 'End my participation early',
          organizerTitle: 'Early return for {{name}}',
          reason: 'Reason',
          selectReason: 'Select a reason',
          reasons: {
            physical_discomfort: 'Physical discomfort',
            injury: 'Injury',
            emergency: 'Emergency',
            personal_decision: 'Personal decision',
            other: 'Other',
          },
          notes: 'Optional notes',
          reasonRequired: 'Select a reason to continue.',
          confirm: 'Start my return',
          organizerConfirm: 'Record return',
          saving: 'Saving…',
          checkout: 'I arrived at the checkpoint',
          checkoutConfirm:
            'Do you confirm that you have arrived at the checkpoint?',
        },
        history: {
          title: 'Hike history',
          loading: 'Loading history…',
          empty: 'You do not have any hikes in your history yet.',
          individual: 'Individual',
          group: 'Group',
          groupOrganizer: 'Group · Organizer',
          loadMore: 'Load more',
          loadingMore: 'Loading…',
          status: {
            active: 'In progress',
            returningEarly: 'Returning early',
            returnedEarly: 'Early return',
            withdrawn: 'Withdrew before start',
            completed: 'Completed',
            cancelled: 'Cancelled',
          },
        },
        terms:
          'I have read and accept the rules and recommendations for the ascent.',
        create: {
          action: 'Create ascent',
          title: 'Create ascent',
          localGuideQuestion: 'Are you traveling with a local guide?',
          submit: 'Create group',
          creating: 'Creating group…',
        },
        join: {
          action: 'Join a group',
          title: 'Join a group',
          code: 'Group code',
          submit: 'Join group',
          joining: 'Joining…',
        },
        group: {
          preparing: 'Preparing',
          title: 'Ascent group',
          code: 'Code',
          copyCode: 'Copy code',
          share: 'Share code',
          codeCopied: 'Code copied.',
          shared: 'Code shared.',
          shareCopied: 'Invitation copied for sharing.',
          shareText: 'Join my group for {{route}}. Code: {{code}}',
        },
        start: {
          slide: 'Slide to start',
          starting: 'Starting…',
        },
        inProgress: {
          status: 'In progress',
          title: 'Hike in progress',
          startedAt: 'Start time',
          route: 'View route',
          map: 'Map',
          references: 'References',
          futureFeature: '{{feature}} will be implemented later.',
        },
        cancel: {
          action: 'Cancel ascent',
          cancelling: 'Cancelling…',
          confirm: 'Cancel this ascent? The group will no longer be available.',
        },
        complete: {
          action: 'Finish ascent',
          completing: 'Finishing…',
          confirm: 'Do you confirm that the group has finished the ascent?',
          completed: 'Completed',
          title: 'Ascent completed',
          back: 'Back to home',
        },
        validation: {
          futureReturn: 'Select a future return date and time.',
          guideName: 'Enter the local guide’s name.',
          acceptTerms: 'You must accept the rules and recommendations.',
          invalidCode: 'Enter a valid 6-character code.',
        },
        errors: {
          loadTitle: 'We could not load your ascent',
          alreadyActive: 'You already belong to an active ascent.',
          codeNotFound: 'We could not find a group with that code.',
          notAccepting: 'That group is no longer accepting members.',
          profileRequired: 'Complete your profile before continuing.',
          accessDenied: 'You do not have access to that group.',
          copyFailed: 'The code could not be copied.',
          shareFailed: 'The code could not be shared.',
          generic: 'The action could not be completed. Try again.',
        },
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
        network:
          'Could not connect to the service. Check your connection and try again.',
        generic: 'There was an authentication problem. Try again.',
      },
    },
  },
} as const;

function normalizeLanguage(value: string | null | undefined): AppLanguage {
  return value?.toLowerCase().startsWith('en') ? 'en' : 'es';
}

function getInitialLanguage(): AppLanguage {
  try {
    const storedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (storedLanguage === 'es' || storedLanguage === 'en') {
      return storedLanguage;
    }
  } catch {
    // Language persistence is optional when browser storage is unavailable.
  }

  return normalizeLanguage(window.navigator.language);
}

void i18n.use(initReactI18next).init({
  resources,
  lng: getInitialLanguage(),
  fallbackLng: 'es',
  supportedLngs: ['es', 'en'],
  load: 'languageOnly',
  initAsync: false,
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (language) => {
  try {
    window.localStorage.setItem(
      LANGUAGE_STORAGE_KEY,
      normalizeLanguage(language)
    );
  } catch {
    // The application still works when language preference cannot be persisted.
  }
});

export function getAppLanguage(language = i18n.resolvedLanguage): AppLanguage {
  return normalizeLanguage(language);
}

export default i18n;
