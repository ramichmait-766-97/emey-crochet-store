import { SiteSettings } from '../models/site-settings.model';

export const PRODUCT_CATEGORIES = [
  'Apparel',
  'Bags & Accessories',
  'Home Decor',
  'Keychains',
] as const;

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  storeName: 'Emey Crochet Store',
  currency: 'USD',
  memberDiscountPercent: 10,
  contacts: [
    {
      id: 'whatsapp',
      type: 'whatsapp',
      label: 'WhatsApp',
      value: '+96100000000',
      url: 'https://wa.me/96100000000',
      enabled: true,
    },
  ],
};
