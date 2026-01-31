/**
 * Dutch (nl-NL) translations for ZZP-HUB Smart Accounting Platform
 * 
 * This file is the single source of truth for all UI text.
 * Use professional Dutch accounting terminology familiar to Dutch ZZP and accountants.
 * 
 * Guidelines:
 * - ZZP: Simple, reassuring language (focus on overzicht, rust, duidelijkheid)
 * - Accountant: Professional terminology (cliënten, dossiers, beoordelen, boekingsfouten, btw)
 */

export const nl = {
  // Common UI elements
  common: {
    save: "Opslaan",
    cancel: "Annuleren",
    close: "Sluiten",
    logout: "Uitloggen",
    loading: "Laden...",
    back: "Terug",
    refresh: "Vernieuwen",
    retry: "Opnieuw proberen",
    next: "Volgende",
    previous: "Vorige",
    yes: "Ja",
    no: "Nee",
    search: "Zoeken",
    filter: "Filteren",
    all: "Alle",
    edit: "Bewerken",
    delete: "Verwijderen",
    add: "Toevoegen",
    submit: "Verzenden",
    clear: "Wissen",
    clearAll: "Alles wissen",
    send: "Verzenden",
    sending: "Verzenden...",
    processing: "Verwerken...",
    execute: "Uitvoeren",
    apply: "Toepassen",
    upload: "Uploaden",
    uploadAll: "Alles uploaden",
    download: "Downloaden",
    copy: "Kopiëren",
    error: "Fout",
    success: "Gelukt",
    warning: "Waarschuwing",
    info: "Informatie",
  },

  // Brand
  brand: {
    name: "Smart Accounting",
    tagline: "Professioneel boekhoudplatform",
  },

  // Authentication
  auth: {
    login: "Inloggen",
    loggingIn: "Inloggen...",
    register: "Registreren",
    creatingAccount: "Account aanmaken...",
    createAccount: "Account aanmaken",
    email: "E-mailadres",
    password: "Wachtwoord",
    confirmPassword: "Wachtwoord bevestigen",
    fullName: "Volledige naam",
    forgotPassword: "Wachtwoord vergeten?",
    verifyEmail: "E-mailadres verifiëren",
    verifyingEmail: "E-mailadres wordt geverifieerd...",
    resendVerification: "Verificatie opnieuw verzenden",
    welcomeBack: "Welkom terug",
    loginDescription: "Log in op je boekhouddashboard",
    registerDescription: "Registreer voor een nieuw boekhoudaccount",
    role: "Rol",
    passwordHint: "Minimaal 8 tekens",
    checkEmail: "Controleer je e-mail",
    checkEmailDescription: "We hebben een verificatielink gestuurd naar",
    verificationLinkInfo: "Klik op de link in de e-mail om je account te verifiëren.",
    linkExpires: "De link verloopt over 24 uur.",
    resendIn: "Opnieuw verzenden over",
    resendVerificationEmail: "Verificatie-e-mail opnieuw verzenden",
    backToLogin: "Terug naar inloggen",
    goToLogin: "Ga naar inloggen",
    emailNotVerified: "E-mailadres niet geverifieerd",
    emailNotVerifiedDescription: "Controleer je inbox voor een verificatie-e-mail.",
    waitToResend: "Wacht {seconds}s om opnieuw te verzenden",
    loginFailed: "Inloggen mislukt",
    registrationFailed: "Registratie mislukt",
    emailVerified: "E-mailadres geverifieerd!",
    emailVerifiedDescription: "Je e-mailadres is succesvol geverifieerd. Je kunt nu inloggen.",
    alreadyVerified: "Al geverifieerd",
    alreadyVerifiedDescription: "Je e-mailadres is al geverifieerd. Je kunt inloggen.",
    verificationFailed: "Verificatie mislukt",
    verificationFailedDescription: "Ongeldige of verlopen verificatielink. Vraag een nieuwe aan.",
    tooManyRequests: "Te veel verzoeken",
    tooManyRequestsDescription: "Wacht 60 seconden en probeer opnieuw.",
    forgotPasswordTitle: "Wachtwoord vergeten",
    forgotPasswordDescription: "Vul je e-mailadres in en we sturen je een link om je wachtwoord opnieuw in te stellen.",
    sendResetLink: "Resetlink verzenden",
    resetEmailSent: "E-mail verzonden",
    resetEmailSentDescription: "Als er een account met dit e-mailadres bestaat, ontvang je binnenkort een wachtwoord-resetlink.",
    didntReceiveEmail: "Geen e-mail ontvangen?",
    checkSpamFolder: "Controleer je spammap of probeer opnieuw met een ander e-mailadres.",
    tryAgain: "Opnieuw proberen",
  },

  // Roles
  roles: {
    zzp: "ZZP",
    zzpDescription: "ZZP (Zelfstandig)",
    accountant: "Boekhouder",
    admin: "Beheerder",
  },

  // Sidebar / Navigation
  sidebar: {
    dashboard: "Dashboard",
    smartTransactions: "Slimme transacties",
    aiUpload: "AI Upload",
    settings: "Instellingen",
    support: "Ondersteuning",
    accountantOverview: "Overzicht",
    accountantClients: "Klanten",
    reviewQueue: "Te beoordelen",
    backToDashboard: "Terug naar Dashboard",
    backToWorkQueue: "Terug naar Werklijst",
    navigationMenu: "Navigatiemenu",
    navigateApp: "Navigeer door de applicatie",
  },

  // Dashboard
  dashboard: {
    title: "Dashboard",
    welcomeBack: "Welkom terug",
    lastUpdated: "Laatst bijgewerkt",
    totalTransactions: "Totaal transacties",
    draftBookings: "Conceptboekingen",
    postedBookings: "Geboekte boekingen",
    balance: "Saldo",
    debit: "Debet",
    credit: "Credit",
    recentTransactions: "Recente transacties",
    recentTransactionsDescription: "Laatste boekingen in het systeem",
    noTransactions: "Geen transacties gevonden",
    noTransactionsDescription: "Upload facturen om te beginnen",
    failedToConnect: "Verbinding met backend mislukt",
  },

  // Transaction statuses
  transactionStatus: {
    draft: "Concept",
    posted: "Geboekt",
    approved: "Goedgekeurd",
  },

  // Accountant specific
  accountant: {
    noClients: "Nog geen klanten gekoppeld",
    noClientsDescription: "Voeg ZZP-klanten toe via hun e-mailadres om hun administratie te beheren.",
    addClient: "Klant toevoegen",
    addFirstClient: "Eerste klant toevoegen",
    addClientByEmail: "Klant toevoegen via e-mail",
    addClientDescription: "Vul het e-mailadres van een ZZP-klant in om deze aan je klantenlijst toe te voegen. De klant moet al geregistreerd zijn en een administratie hebben aangemaakt.",
    inviteByEmail: "Klant uitnodigen via e-mail",
    selectClient: "Selecteer een klant",
    clientEmail: "E-mailadres klant",
    clientOverview: "Klantenportaal",
    clientsCount: "klanten",
    needsAttention: "hebben aandacht nodig",
    noActionNeeded: "Geen actie nodig",
    attentionSoon: "Binnenkort aandacht",
    immediateAction: "Directe actie vereist",
    allClients: "Alle klanten",
    sortedByStatus: "Gesorteerd op status: klanten die actie nodig hebben staan bovenaan",
    clientStatus: "Status",
    lastUpload: "Laatste upload",
    noUploads: "Geen uploads",
    issues: "Problemen",
    action: "Actie",
    reviewIssues: "Problemen bekijken",
    ok: "✓ OK",
    userNotFound: "Geen gebruiker gevonden met dit e-mailadres. De gebruiker moet zich eerst registreren.",
    notZzpUser: "Deze gebruiker is geen ZZP-klant (mogelijk een boekhouder).",
    noAdministration: "Deze gebruiker heeft nog geen administratie aangemaakt.",
    successfullyAdded: "Succesvol toegevoegd",
    issuesRequiringAttention: "problemen vereisen aandacht",
    noIssuesFound: "Geen problemen gevonden",
    accessRestricted: "Toegang beperkt",
    accountantOnly: "Dit dashboard is alleen beschikbaar voor boekhouders die ZZP-klanten beheren.",
    failedToLoadDashboard: "Dashboard laden mislukt",
    // Accountant Home Page
    dailyWorkQueue: "Dagelijkse werklijst",
    clientsAssigned: "klanten toegewezen",
    redIssues: "RODE problemen",
    inReview: "In beoordeling",
    vatDue7d: "BTW binnen 7d",
    docBacklog: "Doc. achterstand",
    alerts: "Meldingen",
    selected: "geselecteerd",
    recalculate: "Herberekenen",
    ackYellow: "GEEL bevestigen",
    vatDraft: "BTW concept",
    sendReminder: "Herinnering sturen",
    allClientsTab: "Alle klanten",
    redIssuesTab: "Rode problemen",
    needsReview: "Te beoordelen",
    vatDueTab: "BTW nadert",
    stale30d: "Inactief 30d",
    client: "Klant",
    score: "Score",
    backlog: "Achterstand",
    vat: "BTW",
    activity: "Activiteit",
    actions: "Acties",
    review: "Beoordelen",
    never: "Nooit",
    noClientsYet: "Nog geen klanten",
    clientsWillAppear: "Klanten verschijnen hier zodra ze aan je zijn toegewezen.",
    backToClientList: "Terug naar klantenlijst",
    // Bulk operations
    bulkRecalculate: "Bulkherberekening validatie",
    bulkAckYellow: "Bulk GELE problemen bevestigen",
    bulkGenerateVat: "Bulk BTW-concept genereren",
    bulkSendReminders: "Bulk herinneringen sturen",
    applyToClients: "Deze actie wordt toegepast op {count} geselecteerde klant(en).",
    reminderType: "Herinneringstype",
    reminderTitle: "Titel",
    reminderMessage: "Bericht",
    actionRequired: "Actie vereist",
    documentMissing: "Document ontbreekt",
    vatDeadline: "BTW-deadline",
    reviewPending: "Beoordeling wachtend",
    completed: "Voltooid",
    completedWithErrors: "Voltooid met fouten",
    failed: "Mislukt",
    successful: "succesvol",
    retryFailed: "Mislukte klanten opnieuw proberen",
  },

  // Empty states
  emptyStates: {
    noData: "Nog geen gegevens beschikbaar",
    noReviewItems: "Geen items om te beoordelen",
    noReviewItemsDescription: "Er zijn geen documenten of transacties die wachten op je beoordeling. Goed bezig!",
    gettingStarted: "Aan de slag",
    // No administrations
    noAdministrationYet: "Nog geen administratie",
    noAdministrationZzp: "Maak je bedrijfsadministratie aan om facturen en uitgaven bij te houden.",
    createAdministration: "Administratie aanmaken",
    adminOrganized: "Je administratie houdt al je financiële gegevens georganiseerd",
    uploadInvoices: "Upload facturen en bonnen voor automatische AI-verwerking",
    trackVat: "Houd BTW-verplichtingen bij en genereer BTW-rapporten",
    // No clients
    noClientsYetAccountant: "Nog geen klanten",
    noClientsAccountant: "Voeg je eerste klantadministratie toe om te beginnen met hun boekhouding.",
    addFirstClientAccountant: "Eerste klant toevoegen",
    eachClientSeparate: "Elke klant krijgt een eigen administratie",
    // No transactions
    noTransactionsYet: "Nog geen transacties",
    noTransactionsDescription: "Upload je eerste factuur of bon om automatisch transacties aan te maken.",
    uploadDocument: "Document uploaden",
    uploadFormats: "Upload PDF's, afbeeldingen of gescande documenten",
    aiExtract: "AI haalt gegevens op en maakt transacties aan",
    reviewBeforePost: "Controleer en keur goed voordat je naar het grootboek boekt",
    // No documents
    noDocumentsUploaded: "Geen documenten geüpload",
    noDocumentsDescription: "Begin met het uploaden van je facturen, bonnen of bankafschriften.",
    uploadFirstDocument: "Eerste document uploaden",
    supportedFormats: "Ondersteunde formaten: PDF, PNG, JPG, JPEG",
    aiProcesses: "AI verwerkt documenten in seconden",
    secureStorage: "Alle documenten worden veilig opgeslagen",
    // No clients assigned
    noClientsAssigned: "Geen klanten toegewezen",
    noClientsAssignedDescription: "Je hebt nog geen klanten toegewezen gekregen. Neem contact op met je beheerder.",
    clientsAssignedByAdmin: "Klanten worden toegewezen door beheerders",
    onceAssigned: "Na toewijzing kun je hun documenten beoordelen",
    trackVatDeadlines: "Houd BTW-deadlines bij en beheer de boekhouding",
    // Review queue
    newItemsAppear: "Nieuwe items verschijnen wanneer klanten documenten uploaden",
    aiTransactionsNeedVerification: "AI-verwerkte transacties kunnen verificatie nodig hebben",
    checkBackLater: "Kom later terug voor nieuwe beoordelingsitems",
  },

  // Settings page
  settings: {
    title: "Instellingen",
    subtitle: "Beheer je profiel, bedrijfsgegevens en voorkeuren",
    profileInfo: "Profielinformatie",
    profileDescription: "Je accountgegevens en contactinformatie",
    emailVerified: "E-mail geverifieerd",
    contactSupport: "Neem contact op met support om je profielgegevens aan te passen.",
    companyInfo: "Bedrijfsinformatie",
    companyDescription: "Je bedrijfsadministratiegegevens",
    companyName: "Bedrijfsnaam",
    kvkNumber: "KVK-nummer",
    btwNumber: "BTW-nummer",
    description: "Omschrijving",
    notSet: "Niet ingesteld",
    noDescription: "Geen omschrijving",
    noAdministrationSetup: "Nog geen administratie ingesteld",
    completeOnboarding: "Voltooi onboarding om je bedrijfsgegevens toe te voegen",
    companyInfoUpdate: "Bedrijfsgegevens kunnen worden bijgewerkt tijdens onboarding of door contact op te nemen met support.",
    notificationPreferences: "Meldingsvoorkeuren",
    notificationDescription: "Bepaal hoe en wanneer je meldingen ontvangt",
    weeklyEmailDigest: "Wekelijkse e-mailsamenvatting",
    weeklyEmailDescription: "Ontvang een wekelijks overzicht van je transacties",
    transactionAlerts: "Transactiemeldingen",
    transactionAlertsDescription: "Word gewaarschuwd wanneer transacties beoordeling nodig hebben",
    vatReminders: "BTW-deadlineherinneringen",
    vatRemindersDescription: "Herinner me voor BTW-aangiftedeadlines",
    documentProcessed: "Document verwerkt",
    documentProcessedDescription: "Waarschuw me wanneer documentverwerking is voltooid",
    savePreferences: "Voorkeuren opslaan",
    comingSoon: "Binnenkort beschikbaar:",
    emailNotificationsFinalized: "E-mailmeldingen worden afgerond. Je voorkeuren worden opgeslagen en toegepast zodra beschikbaar.",
    version: "Versie",
    build: "Build",
    api: "API",
    development: "Ontwikkeling",
    production: "Productie",
    preferencesSaved: "Meldingsvoorkeuren opgeslagen",
  },

  // Support page
  support: {
    title: "Ondersteuning",
    subtitle: "Krijg hulp bij je account of meld een probleem",
    contactInfo: "Contactinformatie",
    contactDescription: "Manieren om ons supportteam te bereiken",
    emailSupport: "E-mail support",
    phoneSupport: "Telefonische support",
    phoneHours: "Ma-Vr, 9:00 - 17:00 CET",
    responseTime: "Responstijd",
    responseTimeValue: "Gewoonlijk binnen 24 uur",
    quickHelp: "Snelle hulp",
    documentation: "Documentatie",
    systemStatus: "Systeemstatus",
    sendMessage: "Bericht sturen",
    sendMessageDescription: "Beschrijf je probleem of vraag en we nemen contact met je op",
    yourName: "Je naam",
    emailAddress: "E-mailadres",
    category: "Categorie",
    selectCategory: "Selecteer een categorie",
    generalQuestion: "Algemene vraag",
    technicalIssue: "Technisch probleem",
    billingAccount: "Facturatie & Account",
    featureRequest: "Functieverzoek",
    subject: "Onderwerp",
    subjectPlaceholder: "Korte beschrijving van je vraag",
    message: "Bericht",
    messagePlaceholder: "Geef zoveel mogelijk details...",
    helpTip: "Voeg relevante details toe zoals foutmeldingen, stappen om te reproduceren, of screenshots om ons te helpen je sneller te helpen.",
    messageSent: "Bericht verzonden!",
    thankYou: "Bedankt voor je bericht. We reageren binnen 24 uur.",
    sendAnotherMessage: "Nog een bericht sturen",
    fillAllFields: "Vul alle verplichte velden in",
    openingEmailClient: "E-mailclient openen...",
    emailClientFallback: "Als je e-mailclient niet opent, mail ons direct op",
  },

  // Smart Transactions page
  smartTransactions: {
    title: "Slimme transacties",
    subtitle: "AI-verwerkte en automatisch gecategoriseerde transacties",
    totalTransactions: "Totaal transacties",
    totalAmount: "Totaalbedrag",
    avgAiConfidence: "Gem. AI-betrouwbaarheid",
    allTransactions: "Alle transacties",
    transactionsOf: "van",
    transactions: "transacties",
    searchTransactions: "Zoek transacties...",
    filterByStatus: "Filter op status",
    allStatus: "Alle statussen",
    loadingTransactions: "Transacties laden...",
    noTransactionsYet: "Nog geen transacties",
    uploadToCreate: "Upload facturen in de AI Upload-tab om automatisch transacties aan te maken",
    date: "Datum",
    failedToLoad: "Transacties laden mislukt",
  },

  // AI Upload / Document Upload
  upload: {
    title: "Document Upload Portaal",
    subtitle: "Upload facturen en bonnen naar de backend voor AI-verwerking",
    pending: "Wachtend",
    uploading: "Uploaden",
    uploaded: "Geüpload",
    errors: "Fouten",
    uploadDocuments: "Documenten uploaden",
    uploadDescription: "Sleep factuur- of bonafbeeldingen hierheen. Bestanden worden geüpload naar de backend.",
    dropHere: "Sleep documenten hier",
    orClickToBrowse: "of klik om te bladeren (PNG, JPG, PDF)",
    uploadedFiles: "Geüploade bestanden",
    size: "Grootte",
    documentId: "Document-ID",
    processedDocuments: "Verwerkte documenten",
    processedDescription: "Documenten geüpload en verwerkt door de AI-worker",
    noDocumentsYet: "Nog geen documenten geüpload",
    loadingDocuments: "Documenten laden...",
    transactionLinked: "Transactie gekoppeld",
    backendIntegration: "Backend integratie:",
    filesUploadedTo: "Bestanden worden geüpload naar",
    sparkWorkerInfo: "De Spark-worker verwerkt automatisch geüploade documenten en maakt concepttransacties aan met AI-voorspelde grootboekrekeningen.",
    reprocess: "Opnieuw verwerken",
    reprocessing: "Opnieuw verwerken...",
    queuedForReprocessing: "Document in wachtrij voor opnieuw verwerken",
    uploadSuccess: "Bestand succesvol geüpload!",
    uploadFailed: "Upload mislukt",
    failedToRead: "Bestand lezen mislukt",
    invalidFileType: "Ongeldig bestandstype: {filename}. Alleen PNG, JPG en PDF zijn toegestaan.",
    ready: "Gereed",
    processing: "Verwerken...",
  },

  // Document Review
  review: {
    documentReviewQueue: "Document beoordelingslijst",
    documents: "Documenten",
    documentsCount: "document(en)",
    withStatus: "met status",
    total: "totaal",
    noDocumentsFound: "Geen documenten gevonden",
    document: "Document",
    status: "Status",
    supplier: "Leverancier",
    amount: "Bedrag",
    confidence: "Betrouwbaarheid",
    duplicate: "Duplicaat",
    extractedInfo: "Geëxtraheerde informatie",
    invoiceNumber: "Factuurnummer",
    invoiceDate: "Factuurdatum",
    dueDate: "Vervaldatum",
    totalAmount: "Totaalbedrag",
    vatAmount: "BTW-bedrag",
    matchingResults: "Matchresultaten",
    matchedToParty: "Gekoppeld aan partij",
    matchedToOpenItem: "Gekoppeld aan openstaande post",
    matchConfidence: "Match-betrouwbaarheid",
    suggestedActions: "Voorgestelde acties",
    extractionConfidence: "Extractie-betrouwbaarheid",
    potentialDuplicate: "Mogelijk duplicaat",
    potentialDuplicateDescription: "Dit document is mogelijk een duplicaat van een bestaand document.",
    reject: "Afwijzen",
    postToJournal: "Naar journaal boeken",
    rejectDocument: "Document afwijzen",
    rejectReason: "Geef een reden voor afwijzing op.",
    reasonPlaceholder: "Reden voor afwijzing...",
    documentPosted: "Document succesvol geboekt",
    documentRejected: "Document afgewezen",
    queuedForReprocessing: "Document in wachtrij voor opnieuw verwerken",
    // Statuses
    statusUploaded: "Geüpload",
    statusProcessing: "Verwerken",
    statusExtracted: "Geëxtraheerd",
    statusNeedsReview: "Te beoordelen",
    statusPosted: "Geboekt",
    statusRejected: "Afgewezen",
    statusDraftReady: "Concept gereed",
    statusFailed: "Mislukt",
  },

  // Work Queue
  workQueue: {
    title: "Werklijst",
    itemsRequiring: "items vereisen aandacht",
    allTab: "Alle",
    redIssues: "Rode problemen",
    needsReview: "Te beoordelen",
    vatDue: "BTW nadert",
    stale30d: "Inactief 30d",
    score: "Score",
    client: "Klant",
    workItem: "Werkitem",
    counts: "Aantallen",
    due: "Deadline",
    noWorkItems: "Geen werkitems in deze lijst",
    allClientsGood: "Alle klanten zijn in goede staat!",
    slaViolations: "SLA-overtredingen",
    critical: "KRITIEK",
    escalationsToday: "escalaties vandaag",
    // Client detail drawer
    period: "Periode",
    noPeriod: "Geen actieve periode",
    issueSummary: "Probleemoverzicht",
    redIssuesCount: "RODE problemen",
    yellowIssuesCount: "GELE problemen",
    docBacklogCount: "Doc. achterstand",
    suggestedNextAction: "Voorgestelde volgende actie",
    quickActions: "Snelle acties",
    viewIssues: "Problemen bekijken",
    startFinalize: "Start afronden",
    perfectHealth: "Perfecte staat!",
    readinessScore: "Gereedheidsscore",
  },

  // BTW / VAT
  vat: {
    onTrack: "Op schema",
    pendingDocs: "Wacht op documenten",
    deadlineApproaching: "Deadline nadert",
    overdue: "Te laat",
    notApplicable: "N.v.t.",
  },

  // API / Connectivity
  api: {
    connectivity: "API-connectiviteit",
    test: "Testen",
    checking: "Controleren...",
    testConnectivity: "Klik op \"Testen\" om API-connectiviteit te controleren",
    configError: "API-configuratiefout",
    currentApiUrl: "Huidige API-URL",
  },

  // Onboarding
  onboarding: {
    welcome: "Welkom",
    letsGetStarted: "Laten we beginnen met het opzetten van je administratie.",
    // Add more onboarding strings as needed
  },

  // Validation errors
  validation: {
    required: "Dit veld is verplicht",
    invalidEmail: "Ongeldig e-mailadres",
    passwordTooShort: "Wachtwoord moet minimaal 8 tekens bevatten",
    passwordsDoNotMatch: "Wachtwoorden komen niet overeen",
  },

  // Date/time
  dateTime: {
    today: "Vandaag",
    yesterday: "Gisteren",
    daysAgo: "dagen geleden",
  },
};

/**
 * Type-safe translation function
 * Usage: t('auth.login') or t('common.save')
 */
type NestedKeyOf<ObjectType extends object> = {
  [Key in keyof ObjectType & (string | number)]: ObjectType[Key] extends object
    ? `${Key}` | `${Key}.${NestedKeyOf<ObjectType[Key]>}`
    : `${Key}`;
}[keyof ObjectType & (string | number)];

type TranslationKey = NestedKeyOf<typeof nl>;

/**
 * Get a translation by dot-notation key
 * @param key - The translation key (e.g., 'auth.login', 'common.save')
 * @returns The translated string
 */
export function t(key: TranslationKey): string {
  const keys = key.split('.');
  let value: unknown = nl;
  
  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = (value as Record<string, unknown>)[k];
    } else {
      console.warn(`Translation key not found: ${key}`);
      return key;
    }
  }
  
  return typeof value === 'string' ? value : key;
}

export default nl;
