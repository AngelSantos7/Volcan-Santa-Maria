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
        close: 'Cerrar',
        signOut: 'Cerrar sesión',
        signingOut: 'Cerrando sesión…',
        unavailable: 'No disponible',
        language: 'Idioma',
        closeNotification: 'Cerrar notificación',
        confirmAction: 'Confirmar acción',
        openCalendar: 'Abrir calendario para {{field}}',
        chooseDate: 'Seleccionar {{field}}',
        month: 'Mes',
        year: 'Año',
        dateFormatHelp: 'DD/MM/AAAA',
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
        accountCreatedTitle: 'Cuenta creada',
        accountCreatedToast: 'Cuenta creada correctamente',
        emailConfirmedToast: 'Correo confirmado correctamente',
        emailConfirmedToastDescription: 'Completa tus datos para continuar.',
        confirmationSentTo:
          'Te enviamos un enlace de confirmación a {{email}}.',
        confirmationRequiredForVisits:
          'Confirma tu correo para poder registrar o unirte a un ascenso.',
        confirmationEmailResent:
          'Si la cuenta puede recibir un correo de confirmación, enviaremos un nuevo enlace.',
        resendConfirmation: 'Reenviar correo',
        resendingConfirmation: 'Reenviando…',
        resendAvailableIn: 'Reenviar en {{seconds}} s',
        backHome: 'Volver al inicio',
        forgotPassword: '¿Olvidaste tu contraseña?',
        forgotPasswordTitle: 'Recuperar contraseña',
        forgotPasswordSubtitle:
          'Ingresa tu correo para solicitar un enlace de recuperación.',
        passwordResetRequestSent:
          'Si existe una cuenta asociada a ese correo, recibirás un enlace para restablecer tu contraseña.',
        sendPasswordReset: 'Enviar enlace',
        sendingPasswordReset: 'Enviando…',
        resetPasswordAction: 'Restablecer contraseña',
        backToLogin: 'Volver a iniciar sesión',
        newPasswordTitle: 'Restablecer contraseña',
        newPasswordSubtitle: 'Crea una contraseña nueva para tu cuenta.',
        newPassword: 'Nueva contraseña',
        confirmNewPassword: 'Confirmar nueva contraseña',
        updatePassword: 'Actualizar contraseña',
        updatingPassword: 'Actualizando…',
        passwordUpdatedToast: 'Contraseña actualizada correctamente',
        activeSession: 'Sesión activa',
        welcome: '¡Bienvenido, {{name}}!',
        welcomeGeneric: '¡Bienvenido!',
        authenticated: 'Tu cuenta está autenticada correctamente.',
        editProfile: 'Editar perfil',
        myProfile: 'Mi perfil',
        showPassword: 'Mostrar contraseña',
        hidePassword: 'Ocultar contraseña',
        verificationPersistentNotice:
          'Confirma tu correo para habilitar el registro de ascensos.',
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
        registrationCompleted: 'Registro completado exitosamente',
        relationships: {
          parent: 'Madre o padre',
          spouse: 'Pareja o cónyuge',
          sibling: 'Hermana o hermano',
          child: 'Hija o hijo',
          relative: 'Otro familiar',
          friend: 'Amistad',
          other: 'Otro',
        },
        validation: {
          nationalityRequired: 'Selecciona una nacionalidad.',
          dateOfBirthRequired: 'Selecciona una fecha de nacimiento.',
          dateOfBirthInvalid:
            'Selecciona una fecha de nacimiento válida y razonable.',
          phoneRequired: 'Falta el teléfono.',
          phoneInvalid: 'Ingresa un teléfono válido para el país seleccionado.',
          documentTypeRequired: 'Selecciona el tipo de documento.',
          documentNumberRequired: 'Falta el número de documento.',
          documentNumberInvalid:
            'Ingresa un número de documento válido de 3 a 40 caracteres.',
          emergencyFirstNameRequired:
            'Falta el nombre del contacto de emergencia.',
          emergencyFirstNameInvalid:
            'Ingresa un nombre válido para el contacto de emergencia.',
          emergencyLastNameRequired:
            'Falta el apellido del contacto de emergencia.',
          emergencyLastNameInvalid:
            'Ingresa un apellido válido para el contacto de emergencia.',
          relationshipRequired: 'Selecciona el parentesco.',
          emergencyPhoneRequired:
            'Falta el teléfono del contacto de emergencia.',
          emergencyPhoneInvalid:
            'Ingresa un teléfono válido para el contacto de emergencia.',
        },
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
        plannedStart: 'Inicio planificado',
        startDate: 'Fecha planificada de inicio',
        startTime: 'Hora planificada de inicio',
        returnDate: 'Fecha estimada de regreso',
        returnTime: 'Hora estimada de regreso',
        timePicker: {
          hour: 'Hora',
          minute: 'Minutos',
        },
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
          groupWithCount_one: 'Grupal · {{count}} participante',
          groupWithCount_other: 'Grupal · {{count}} participantes',
          organizer: 'Organizador',
          startedAt: 'Inicio',
          endedAt: 'Finalización',
          duration: 'Duración',
          durationHoursMinutes: '{{hours}} h {{minutes}} min',
          durationMinutes: '{{minutes}} min',
          loadMore: 'Cargar más',
          loadingMore: 'Cargando…',
          viewMembers: 'Ver integrantes',
          hideMembers: 'Ocultar integrantes',
          membersTitle: 'Integrantes',
          loadingMembers: 'Cargando integrantes…',
          memberStatus: {
            active: 'En curso',
            returningEarly: 'Regresando antes',
            returnedEarly: 'Retorno anticipado',
            withdrawn: 'Se retiró antes de iniciar',
            completed: 'Completado',
          },
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
        recommendationsConsent:
          'He leído y acepto las recomendaciones para realizar el ascenso.',
        viewRecommendations: 'Ver recomendaciones',
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
          startedAt: 'Inicio',
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
          startDateRequired: 'Selecciona una fecha planificada de inicio.',
          startDatePast: 'La fecha de inicio no puede ser anterior a hoy.',
          startDateInvalid: 'Ingresa una fecha de inicio válida.',
          startTimeRequired: 'Selecciona una hora planificada de inicio.',
          futureStart:
            'La fecha y hora de inicio deben ser posteriores al momento actual.',
          startBeforeReturn:
            'El inicio planificado debe ser anterior al retorno estimado.',
          returnDateRequired: 'Selecciona una fecha estimada de regreso.',
          returnDatePast: 'La fecha de regreso no puede ser anterior a hoy.',
          returnDateInvalid: 'Ingresa una fecha de regreso válida.',
          returnTimeRequired: 'Selecciona una hora estimada de regreso.',
          futureReturn:
            'La fecha y hora de regreso deben ser posteriores al momento actual.',
          guideName: 'Ingresa el nombre del guía local.',
          acceptTerms: 'Debes aceptar las normas y recomendaciones.',
          acceptRecommendations:
            'Debes leer y aceptar las recomendaciones para continuar.',
          invalidCode: 'Ingresa un código válido de 6 caracteres.',
        },
        errors: {
          loadTitle: 'No pudimos cargar tu ascenso',
          alreadyActive: 'Ya perteneces a un ascenso activo.',
          codeNotFound: 'No encontramos un grupo con ese código.',
          notAccepting: 'Ese grupo ya no acepta integrantes.',
          profileRequired: 'Completa tu perfil antes de continuar.',
          accessDenied: 'No tienes acceso a ese grupo.',
          emailVerificationRequired:
            'Debes confirmar tu correo antes de registrar un ascenso.',
          copyFailed: 'No se pudo copiar el código.',
          shareFailed: 'No se pudo compartir el código.',
          generic: 'No se pudo completar la acción. Inténtalo de nuevo.',
        },
      },
      routes: {
        eyebrow: 'Ruta informativa',
        title: 'Ruta: {{route}}',
        open: 'Ver información de la ruta',
        tabsLabel: 'Secciones de la ruta',
        tabs: {
          recommendations: 'Recomendaciones',
          map: 'Mapa',
          weather: 'Clima',
          references: 'Referencias',
        },
        loading: 'Cargando información de la ruta…',
        loadError: 'No pudimos cargar la información de la ruta.',
        cachedData: 'Mostrando la información guardada en este dispositivo.',
        noDescription: 'Aún no hay una descripción disponible para esta ruta.',
        difficulty: 'Dificultad',
        distance: 'Distancia',
        duration: 'Duración estimada',
        elevationGain: 'Desnivel positivo',
        noCheckpoints: 'Aún no hay puntos de referencia publicados.',
        noPhotos: 'Aún no hay fotografías publicadas.',
        photosLoadError:
          'No fue posible cargar las fotografías en este momento.',
        routePhotos: 'Fotografías de la ruta',
        photos: {
          previous: 'Fotografía anterior',
          next: 'Fotografía siguiente',
          position: '{{current}} de {{total}}',
        },
        altitude: '{{altitude}} m de altitud',
        map: {
          loading: 'Cargando mapa…',
          loaded: 'Mapa cargado correctamente.',
          loadError: 'No pudimos cargar el mapa.',
          mapLabel: 'Mapa interactivo del Volcán Santa María',
          baseMapControl: 'Seleccionar mapa base',
          mapBase: 'Mapa',
          satelliteBase: 'Satélite',
          satelliteUnavailable:
            'Configura VITE_MAPTILER_KEY para habilitar Satélite.',
          satelliteLoadError:
            'No fue posible cargar Satélite. Se restauró la vista Mapa.',
          recenter: 'Volver a centrar en el volcán',
          selectedPoint: 'Información del punto seleccionado',
          closeDetails: 'Cerrar información',
          volcanoReference: 'Referencia del volcán',
          summitMarkerLabel: 'Ver información del Volcán Santa María',
          checkpointMarkerLabel: 'Ver punto de referencia: {{name}}',
          trackPending: 'Trazado detallado pendiente de incorporar.',
          noCheckpoints:
            'Aún no hay puntos de referencia con coordenadas para mostrar.',
          mediaLoadError:
            'El mapa está disponible, pero no fue posible cargar sus fotografías.',
        },
        checkpointTypes: {
          start: 'Inicio',
          reference: 'Referencia',
          rest: 'Descanso',
          viewpoint: 'Mirador',
          summit: 'Cima',
        },
        recommendations: {
          intro:
            'Prepárate con anticipación y toma decisiones prudentes durante todo el ascenso.',
          items: {
            preparation: {
              title: 'Preparación antes del ascenso',
              body: 'Revisa la ruta, calcula tiempo suficiente y comunica tu plan a una persona de confianza.',
            },
            clothing: {
              title: 'Vestimenta adecuada',
              body: 'Usa calzado con buena tracción y lleva capas para cambios de temperatura, viento o lluvia.',
            },
            hydration: {
              title: 'Hidratación y alimentación',
              body: 'Lleva suficiente agua y alimentos prácticos para la duración prevista del recorrido.',
            },
            lighting: {
              title: 'Linterna e iluminación',
              body: 'Lleva una linterna funcional y energía de respaldo, especialmente si iniciarás antes del amanecer.',
            },
            weather: {
              title: 'Condiciones climáticas',
              body: 'Consulta el pronóstico y reconsidera el ascenso si las condiciones cambian de forma desfavorable.',
            },
            stayOnRoute: {
              title: 'Permanecer en la ruta',
              body: 'Sigue los senderos y referencias reconocibles. Evita atajos o zonas que no conozcas.',
            },
            waste: {
              title: 'Manejo de basura',
              body: 'Regresa contigo todos tus residuos y evita dejar restos de alimentos en el trayecto.',
            },
            environment: {
              title: 'Respeto al entorno natural',
              body: 'No extraigas plantas, rocas ni otros elementos, y procura reducir el ruido.',
            },
            returnSafety: {
              title: 'Retorno y seguridad',
              body: 'Respeta la hora de retorno prevista y utiliza el retorno anticipado si necesitas terminar antes.',
            },
            emergency: {
              title: 'Qué hacer ante una emergencia',
              body: 'Mantén la calma, permanece con el grupo cuando sea posible y solicita ayuda por los medios disponibles.',
            },
          },
        },
      },
      weather: {
        loading: 'Consultando el pronóstico…',
        unavailable:
          'El pronóstico no está disponible en este momento. La aplicación puede seguir utilizándose normalmente.',
        incomplete: 'El servicio no devolvió datos meteorológicos completos.',
        cached: 'Mostrando el último pronóstico guardado en este dispositivo.',
        previousData:
          'No fue posible actualizar. Se conservan los últimos datos disponibles.',
        referenceNotice:
          'Pronóstico de referencia para el área del Volcán Santa María. No garantiza condiciones seguras.',
        temperature: 'Temperatura',
        volcanoName: 'Volcán Santa María',
        feelsLike: 'Sensación de {{value}} °C',
        humidity: 'Humedad',
        cloudCover: 'Nubosidad',
        sunrise: 'Amanecer',
        sunset: 'Atardecer',
        rain: 'Probabilidad de lluvia',
        rainShort: 'lluvia {{value}} %',
        wind: 'Viento',
        gusts: 'Ráfagas',
        nextHours: 'Próximas horas',
        current: 'Ahora',
        refresh: 'Actualizar',
        refreshing: 'Actualizando…',
        temperatureTrend: 'Tendencia de temperatura',
        rainTrend: 'Probabilidad de lluvia por hora',
        updatedAt: 'Actualizado: {{date}}',
        risk: {
          favorable: 'Favorable',
          precaution: 'Precaución',
          adverse: 'Adverso',
          unavailable: 'Sin datos',
        },
        conditions: {
          clear: 'Cielo despejado',
          partlyCloudy: 'Parcialmente nublado',
          overcast: 'Nublado',
          fog: 'Niebla',
          drizzle: 'Llovizna',
          freezingDrizzle: 'Llovizna helada',
          rain: 'Lluvia',
          freezingRain: 'Lluvia helada',
          snow: 'Nieve',
          showers: 'Chubascos',
          thunderstorm: 'Tormenta',
          unknown: 'Condición no disponible',
        },
        hike: {
          title: 'Pronóstico para tu ascenso',
          plannedPeriod: 'Según el horario planificado',
          conditionsTitle: 'Condiciones previstas',
          departure: 'Salida prevista',
          during: 'Durante el ascenso',
          return: 'Retorno previsto',
          summary:
            'Hasta {{rain}} % de probabilidad de lluvia y viento de hasta {{wind}} km/h en el periodo previsto.',
          outOfRange:
            'El pronóstico todavía no está disponible para esta fecha.',
          outOfRangeFollowUp:
            'Se actualizará cuando la fecha esté dentro del rango disponible.',
          recommendationsTitle: 'Recomendaciones para estas condiciones',
          referenceFastChange:
            'Pronóstico de referencia. En alta montaña las condiciones pueden cambiar rápidamente.',
          advice: {
            rainProtection:
              'Lleva protección impermeable y protege el equipo sensible.',
            moderateGusts:
              'Prepárate para ráfagas y revisa el ajuste de tu equipo.',
            strongWind:
              'Valora posponer el ascenso ante viento o ráfagas fuertes.',
            rainIncreasingAtReturn:
              'La lluvia puede aumentar hacia el retorno; conserva margen de tiempo.',
          },
        },
      },
      announcements: {
        understood: 'Entendido',
        dismiss: 'Cerrar aviso',
      },
      validation: {
        required: 'Completa todos los campos.',
        completeRequiredFields: 'Completa los campos obligatorios',
        firstNameRequired: 'Falta el nombre.',
        invalidFirstName: 'Ingresa un nombre válido.',
        lastNameRequired: 'Falta el apellido.',
        invalidLastName: 'Ingresa un apellido válido.',
        emailRequired: 'Falta el correo electrónico.',
        passwordRequired: 'Falta la contraseña.',
        confirmPasswordRequired: 'Confirma la contraseña.',
        captchaRequired: 'Completa la verificación de seguridad.',
        captchaExpired: 'La verificación expiró. Complétala nuevamente.',
        captchaTemporary:
          'No pudimos cargar la verificación. Inténtalo nuevamente.',
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
        accountCreation:
          'No fue posible crear la cuenta. Revisa los datos e inténtalo nuevamente.',
        accountExistsTitle: 'Ya existe una cuenta con este correo.',
        accountExistsDescription:
          'Inicia sesión o restablece tu contraseña para continuar.',
        weakPassword: 'La contraseña no cumple los requisitos de seguridad.',
        samePassword: 'La nueva contraseña debe ser diferente a la actual.',
        captchaFailed:
          'No pudimos validar la verificación de seguridad. Inténtalo nuevamente.',
        rateLimit:
          'Has realizado demasiados intentos. Espera un momento e inténtalo nuevamente.',
        signupDisabled: 'El registro no está disponible en este momento.',
        network:
          'No se pudo conectar con el servicio. Revisa tu conexión e inténtalo de nuevo.',
        recoveryExpired:
          'El enlace de recuperación expiró o ya no es válido. Solicita uno nuevo.',
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
        close: 'Close',
        signOut: 'Sign out',
        signingOut: 'Signing out…',
        unavailable: 'Unavailable',
        language: 'Language',
        closeNotification: 'Close notification',
        confirmAction: 'Confirm action',
        openCalendar: 'Open calendar for {{field}}',
        chooseDate: 'Choose {{field}}',
        month: 'Month',
        year: 'Year',
        dateFormatHelp: 'DD/MM/YYYY',
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
        accountCreatedTitle: 'Account created',
        accountCreatedToast: 'Account created successfully',
        emailConfirmedToast: 'Email confirmed successfully',
        emailConfirmedToastDescription:
          'Complete your information to continue.',
        confirmationSentTo: 'We sent a confirmation link to {{email}}.',
        confirmationRequiredForVisits:
          'Confirm your email to register or join an ascent.',
        confirmationEmailResent:
          'If the account can receive a confirmation email, we will send a new link.',
        resendConfirmation: 'Resend email',
        resendingConfirmation: 'Resending…',
        resendAvailableIn: 'Resend in {{seconds}}s',
        backHome: 'Back to home',
        forgotPassword: 'Forgot your password?',
        forgotPasswordTitle: 'Reset your password',
        forgotPasswordSubtitle: 'Enter your email to request a recovery link.',
        passwordResetRequestSent:
          'If an account is associated with that email, you will receive a link to reset your password.',
        sendPasswordReset: 'Send link',
        sendingPasswordReset: 'Sending…',
        resetPasswordAction: 'Reset password',
        backToLogin: 'Back to sign in',
        newPasswordTitle: 'Reset password',
        newPasswordSubtitle: 'Create a new password for your account.',
        newPassword: 'New password',
        confirmNewPassword: 'Confirm new password',
        updatePassword: 'Update password',
        updatingPassword: 'Updating…',
        passwordUpdatedToast: 'Password updated successfully',
        activeSession: 'Active session',
        welcome: 'Welcome, {{name}}!',
        welcomeGeneric: 'Welcome!',
        authenticated: 'Your account is authenticated.',
        editProfile: 'Edit profile',
        myProfile: 'My profile',
        showPassword: 'Show password',
        hidePassword: 'Hide password',
        verificationPersistentNotice:
          'Confirm your email to enable ascent registration.',
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
        registrationCompleted: 'Registration completed successfully',
        relationships: {
          parent: 'Parent',
          spouse: 'Partner or spouse',
          sibling: 'Sibling',
          child: 'Child',
          relative: 'Other relative',
          friend: 'Friend',
          other: 'Other',
        },
        validation: {
          nationalityRequired: 'Select a nationality.',
          dateOfBirthRequired: 'Select a date of birth.',
          dateOfBirthInvalid: 'Select a valid and reasonable date of birth.',
          phoneRequired: 'Enter your phone number.',
          phoneInvalid: 'Enter a valid phone number for the selected country.',
          documentTypeRequired: 'Select a document type.',
          documentNumberRequired: 'Enter the document number.',
          documentNumberInvalid:
            'Enter a valid document number between 3 and 40 characters.',
          emergencyFirstNameRequired:
            "Enter the emergency contact's first name.",
          emergencyFirstNameInvalid:
            'Enter a valid first name for the emergency contact.',
          emergencyLastNameRequired: "Enter the emergency contact's last name.",
          emergencyLastNameInvalid:
            'Enter a valid last name for the emergency contact.',
          relationshipRequired: 'Select the relationship.',
          emergencyPhoneRequired: "Enter the emergency contact's phone number.",
          emergencyPhoneInvalid:
            'Enter a valid phone number for the emergency contact.',
        },
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
        summitRoute: 'Summit Route',
        tripType: 'Trip type',
        types: {
          day_hike: 'Day Hike',
          expedition_camping: 'Expedition & Camping',
        },
        expectedReturn: 'Estimated return',
        plannedStart: 'Planned start',
        startDate: 'Planned start date',
        startTime: 'Planned start time',
        returnDate: 'Estimated return date',
        returnTime: 'Estimated return time',
        timePicker: {
          hour: 'Hour',
          minute: 'Minutes',
        },
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
          groupWithCount_one: 'Group · {{count}} participant',
          groupWithCount_other: 'Group · {{count}} participants',
          organizer: 'Organizer',
          startedAt: 'Start',
          endedAt: 'Finish',
          duration: 'Duration',
          durationHoursMinutes: '{{hours}} h {{minutes}} min',
          durationMinutes: '{{minutes}} min',
          loadMore: 'Load more',
          loadingMore: 'Loading…',
          viewMembers: 'View members',
          hideMembers: 'Hide members',
          membersTitle: 'Members',
          loadingMembers: 'Loading members…',
          memberStatus: {
            active: 'In progress',
            returningEarly: 'Returning early',
            returnedEarly: 'Early return',
            withdrawn: 'Withdrew before start',
            completed: 'Completed',
          },
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
        recommendationsConsent:
          'I have read and accept the recommendations for the hike.',
        viewRecommendations: 'View recommendations',
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
          startedAt: 'Start',
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
          startDateRequired: 'Select a planned start date.',
          startDatePast: 'The start date cannot be before today.',
          startDateInvalid: 'Enter a valid start date.',
          startTimeRequired: 'Select a planned start time.',
          futureStart:
            'The start date and time must be later than the current time.',
          startBeforeReturn:
            'The planned start must be earlier than the estimated return.',
          returnDateRequired: 'Select an estimated return date.',
          returnDatePast: 'The return date cannot be before today.',
          returnDateInvalid: 'Enter a valid return date.',
          returnTimeRequired: 'Select an estimated return time.',
          futureReturn:
            'The return date and time must be later than the current time.',
          guideName: 'Enter the local guide’s name.',
          acceptTerms: 'You must accept the rules and recommendations.',
          acceptRecommendations:
            'You must read and accept the recommendations to continue.',
          invalidCode: 'Enter a valid 6-character code.',
        },
        errors: {
          loadTitle: 'We could not load your ascent',
          alreadyActive: 'You already belong to an active ascent.',
          codeNotFound: 'We could not find a group with that code.',
          notAccepting: 'That group is no longer accepting members.',
          profileRequired: 'Complete your profile before continuing.',
          accessDenied: 'You do not have access to that group.',
          emailVerificationRequired:
            'You must confirm your email before registering an ascent.',
          copyFailed: 'The code could not be copied.',
          shareFailed: 'The code could not be shared.',
          generic: 'The action could not be completed. Try again.',
        },
      },
      routes: {
        eyebrow: 'Route information',
        title: 'Route: {{route}}',
        open: 'View route information',
        tabsLabel: 'Route sections',
        tabs: {
          recommendations: 'Recommendations',
          map: 'Map',
          weather: 'Weather',
          references: 'References',
        },
        loading: 'Loading route information…',
        loadError: 'We could not load the route information.',
        cachedData: 'Showing the information saved on this device.',
        noDescription: 'No description is available for this route yet.',
        difficulty: 'Difficulty',
        distance: 'Distance',
        duration: 'Estimated duration',
        elevationGain: 'Elevation gain',
        noCheckpoints: 'No reference points have been published yet.',
        noPhotos: 'No photos have been published yet.',
        photosLoadError: 'Photos could not be loaded at this time.',
        routePhotos: 'Route photos',
        photos: {
          previous: 'Previous photo',
          next: 'Next photo',
          position: '{{current}} of {{total}}',
        },
        altitude: '{{altitude}} m elevation',
        map: {
          loading: 'Loading map…',
          loaded: 'Map loaded successfully.',
          loadError: 'We could not load the map.',
          mapLabel: 'Interactive map of Santa María Volcano',
          baseMapControl: 'Select base map',
          mapBase: 'Map',
          satelliteBase: 'Satellite',
          satelliteUnavailable:
            'Configure VITE_MAPTILER_KEY to enable Satellite.',
          satelliteLoadError:
            'Satellite could not be loaded. The Map view was restored.',
          recenter: 'Recenter on the volcano',
          selectedPoint: 'Selected point information',
          closeDetails: 'Close information',
          volcanoReference: 'Volcano reference',
          summitMarkerLabel: 'View Santa María Volcano information',
          checkpointMarkerLabel: 'View reference point: {{name}}',
          trackPending: 'Detailed route track pending.',
          noCheckpoints:
            'There are no reference points with coordinates to display yet.',
          mediaLoadError:
            'The map is available, but its photos could not be loaded.',
        },
        checkpointTypes: {
          start: 'Start',
          reference: 'Reference',
          rest: 'Rest stop',
          viewpoint: 'Viewpoint',
          summit: 'Summit',
        },
        recommendations: {
          intro:
            'Prepare in advance and make prudent decisions throughout the hike.',
          items: {
            preparation: {
              title: 'Preparation before the hike',
              body: 'Review the route, allow enough time, and share your plan with someone you trust.',
            },
            clothing: {
              title: 'Appropriate clothing',
              body: 'Wear footwear with good traction and bring layers for changes in temperature, wind, or rain.',
            },
            hydration: {
              title: 'Hydration and food',
              body: 'Carry enough water and practical food for the expected duration of the hike.',
            },
            lighting: {
              title: 'Flashlight and lighting',
              body: 'Bring a working flashlight and backup power, especially if you will start before sunrise.',
            },
            weather: {
              title: 'Weather conditions',
              body: 'Check the forecast and reconsider the hike if conditions change unfavorably.',
            },
            stayOnRoute: {
              title: 'Stay on the route',
              body: 'Follow recognizable trails and references. Avoid shortcuts or unfamiliar areas.',
            },
            waste: {
              title: 'Waste management',
              body: 'Take all waste back with you and do not leave food scraps along the trail.',
            },
            environment: {
              title: 'Respect the natural environment',
              body: 'Do not remove plants, rocks, or other natural elements, and keep noise to a minimum.',
            },
            returnSafety: {
              title: 'Return and safety',
              body: 'Respect the planned return time and use early return if you need to finish sooner.',
            },
            emergency: {
              title: 'What to do in an emergency',
              body: 'Stay calm, remain with the group when possible, and request help through available means.',
            },
          },
        },
      },
      weather: {
        loading: 'Checking the forecast…',
        unavailable:
          'The forecast is unavailable right now. You can continue using the application normally.',
        incomplete: 'The service did not return complete weather data.',
        cached: 'Showing the latest forecast saved on this device.',
        previousData:
          'The update failed. The latest available data remains visible.',
        referenceNotice:
          'Reference forecast for the Santa María Volcano area. It does not guarantee safe conditions.',
        temperature: 'Temperature',
        volcanoName: 'Santa María Volcano',
        feelsLike: 'Feels like {{value}} °C',
        humidity: 'Humidity',
        cloudCover: 'Cloud cover',
        sunrise: 'Sunrise',
        sunset: 'Sunset',
        rain: 'Rain probability',
        rainShort: 'rain {{value}}%',
        wind: 'Wind',
        gusts: 'Gusts',
        nextHours: 'Next hours',
        current: 'Now',
        refresh: 'Refresh',
        refreshing: 'Refreshing…',
        temperatureTrend: 'Temperature trend',
        rainTrend: 'Hourly rain probability',
        updatedAt: 'Updated: {{date}}',
        risk: {
          favorable: 'Favorable',
          precaution: 'Use caution',
          adverse: 'Adverse',
          unavailable: 'No data',
        },
        conditions: {
          clear: 'Clear sky',
          partlyCloudy: 'Partly cloudy',
          overcast: 'Overcast',
          fog: 'Fog',
          drizzle: 'Drizzle',
          freezingDrizzle: 'Freezing drizzle',
          rain: 'Rain',
          freezingRain: 'Freezing rain',
          snow: 'Snow',
          showers: 'Rain showers',
          thunderstorm: 'Thunderstorm',
          unknown: 'Condition unavailable',
        },
        hike: {
          title: 'Forecast for your hike',
          plannedPeriod: 'Based on your planned schedule',
          conditionsTitle: 'Expected conditions',
          departure: 'Planned departure',
          during: 'During the hike',
          return: 'Planned return',
          summary:
            'Up to {{rain}}% chance of rain and wind up to {{wind}} km/h during the planned period.',
          outOfRange: 'The forecast is not available for this date yet.',
          outOfRangeFollowUp:
            'It will update when the date is within the available forecast range.',
          recommendationsTitle: 'Recommendations for these conditions',
          referenceFastChange:
            'Reference forecast. Mountain conditions can change quickly.',
          advice: {
            rainProtection:
              'Bring waterproof protection and keep sensitive gear dry.',
            moderateGusts:
              'Prepare for gusts and check that your gear is secure.',
            strongWind:
              'Consider postponing the hike when winds or gusts are strong.',
            rainIncreasingAtReturn:
              'Rain may increase near your return; keep extra time in reserve.',
          },
        },
      },
      announcements: {
        understood: 'Got it',
        dismiss: 'Dismiss announcement',
      },
      validation: {
        required: 'Complete all fields.',
        completeRequiredFields: 'Complete the required fields',
        firstNameRequired: 'Enter your first name.',
        invalidFirstName: 'Enter a valid first name.',
        lastNameRequired: 'Enter your last name.',
        invalidLastName: 'Enter a valid last name.',
        emailRequired: 'Enter your email address.',
        passwordRequired: 'Enter your password.',
        confirmPasswordRequired: 'Confirm your password.',
        captchaRequired: 'Complete the security check.',
        captchaExpired: 'The security check expired. Complete it again.',
        captchaTemporary:
          'We could not load the security check. Please try again.',
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
        accountCreation:
          'The account could not be created. Review your details and try again.',
        accountExistsTitle: 'An account already exists with this email.',
        accountExistsDescription: 'Sign in or reset your password to continue.',
        weakPassword: 'The password does not meet the security requirements.',
        samePassword:
          'Your new password must be different from your current password.',
        captchaFailed:
          'We could not validate the security check. Please try again.',
        rateLimit: 'Too many attempts. Wait a moment and try again.',
        signupDisabled: 'Registration is not available right now.',
        network:
          'Could not connect to the service. Check your connection and try again.',
        recoveryExpired:
          'The recovery link has expired or is no longer valid. Request a new one.',
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
