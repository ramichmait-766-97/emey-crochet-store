export type ContactMethodType = 'whatsapp' | 'phone' | 'instagram' | 'email' | 'custom';

export interface ContactMethod {
  id: string;
  type: ContactMethodType;
  label: string;
  value: string;
  url?: string;
  enabled: boolean;
}

export interface SiteSettings {
  storeName: string;
  currency: string;
  memberDiscountPercent: number;
  contacts: ContactMethod[];
}
