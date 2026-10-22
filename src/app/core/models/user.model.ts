export type StoreRole = 'user' | 'admin';

export interface StoreUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: StoreRole;
}
