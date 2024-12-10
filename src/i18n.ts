import i18next from 'i18next';
   import { initReactI18next } from 'react-i18next';
   import enTranslations from './locales/en.json';
   import koTranslations from './locales/ko.json';

   i18next
     .use(initReactI18next)
     .init({
       resources: {
         en: { translation: enTranslations },
         ko: { translation: koTranslations },
       },
       lng: 'en', // Default language
       fallbackLng: 'en',
       interpolation: {
         escapeValue: false,
       },
     });

   export default i18next;
