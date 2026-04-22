export const APP_CONFIG = {
  name: 'Packya Gestión',
  version: '2.0.0',
  company: 'Packya',
  printingBaseCost: 100,
  environment: String(import.meta.env.VITE_APP_ENV ?? 'local').trim().toLowerCase(),
}