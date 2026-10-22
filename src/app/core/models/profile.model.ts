export interface CustomerProfile {
  displayName: string;
  phone: string;
  billing: {
    fullName: string;
    company: string;
    taxId: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    region: string;
    postalCode: string;
    country: string;
  };
  notifications: { orderUpdates: boolean; emailOffers: boolean };
}

export function emptyProfile(): CustomerProfile {
  return {
    displayName: '',
    phone: '',
    billing: {
      fullName: '',
      company: '',
      taxId: '',
      addressLine1: '',
      addressLine2: '',
      city: '',
      region: '',
      postalCode: '',
      country: '',
    },
    notifications: { orderUpdates: true, emailOffers: false },
  };
}
