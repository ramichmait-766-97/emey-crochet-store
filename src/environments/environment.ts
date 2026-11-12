export const environment = {
  production: true,
  firestoreDatabase: 'maindb',
  commerce: {
    // Public connection settings; private credentials remain Worker secrets.
    apiUrl: 'https://emey-commerce.rami-chmait97.workers.dev' as string,
    turnstileSiteKey: '0x4AAAAAAFpeooshSFRdGaCY' as string,
  },
  images: {
    urlEndpoint: 'https://ik.imagekit.io/s5yr4ioi1',
    uploadWorkerUrl: 'https://emey-image-upload.rami-chmait97.workers.dev',
  },
  firebase: {
    apiKey: 'AIzaSyAlSg_gD4KZzgQ2S_zX2e5FjnYjW-zGNdY',
    authDomain: 'emey-crochet-store.firebaseapp.com',
    projectId: 'emey-crochet-store',
    storageBucket: 'emey-crochet-store.firebasestorage.app',
    messagingSenderId: '492925492204',
    appId: '1:492925492204:web:2946b5848fedc649af3ec9',
    measurementId: 'G-L5DBW431CS',
  },
} as const;
