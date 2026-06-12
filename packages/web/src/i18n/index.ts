// i18n foundation (spec §8.8): typesafe keys, en first, catalogue structure
// ready for fr / am / ar. RTL locales flip the document direction. The shell
// and entry chrome are migrated; remaining screens migrate incrementally —
// new strings must go through t().
const en = {
  'app.tagline': 'data online, data offline',
  'nav.enterData': 'Enter Data',
  'nav.review': 'Review & Approve',
  'nav.dashboards': 'Dashboards',
  'nav.maps': 'Maps',
  'nav.explore': 'Explore',
  'nav.framework': 'Framework',
  'nav.configure': 'Configure',
  'nav.signOut': 'sign out',
  'login.username': 'Username',
  'login.password': 'Password',
  'login.signIn': 'Sign in',
  'login.failed': 'login failed',
  'sync.synced': '● synced',
  'sync.syncing': '◌ syncing…',
  'sync.offline': '◌ offline',
  'sync.offlinePending': '◌ offline — {n} pending',
  'sync.pending': '◌ {n} pending',
  'sync.conflicts': '▲ {n} conflict(s)',
  'sync.failed': '▲ {n} failed',
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
} as const;

export type MessageKey = keyof typeof en;

const catalogues: Record<string, Partial<Record<MessageKey, string>>> = {
  en,
  // fr / am / ar arrive as translations land; missing keys fall back to en
  fr: {},
  am: {},
  ar: {},
};

const RTL_LOCALES = new Set(['ar']);

let activeLocale = 'en';

export function setLocale(locale: string): void {
  activeLocale = catalogues[locale] ? locale : 'en';
  document.documentElement.lang = activeLocale;
  document.documentElement.dir = RTL_LOCALES.has(activeLocale) ? 'rtl' : 'ltr';
}

export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const message = catalogues[activeLocale]?.[key] ?? en[key];
  if (!params) return message;
  return message.replace(/\{(\w+)\}/g, (_, name: string) =>
    String(params[name] ?? `{${name}}`),
  );
}
