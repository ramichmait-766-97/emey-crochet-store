import { DocumentData, DocumentReference, Query, onSnapshot } from 'firebase/firestore';
import { Observable } from 'rxjs';

export function collectionData<T>(
  query: Query<DocumentData>,
  decode: (data: unknown) => T,
  options: { idField?: string } = {},
): Observable<T[]> {
  return new Observable((subscriber) =>
    onSnapshot(
      query,
      (snapshot) => {
        try {
          subscriber.next(
            snapshot.docs.map((doc) =>
              decode({ ...doc.data(), ...(options.idField ? { [options.idField]: doc.id } : {}) }),
            ),
          );
        } catch (error) {
          subscriber.error(error);
        }
      },
      (error) => subscriber.error(error),
    ),
  );
}

export function docData<T>(
  ref: DocumentReference<DocumentData>,
  decode: (data: unknown) => T,
  options: { idField?: string } = {},
): Observable<T | undefined> {
  return new Observable((subscriber) =>
    onSnapshot(
      ref,
      (snapshot) => {
        try {
          subscriber.next(
            snapshot.exists()
              ? decode({
                  ...snapshot.data(),
                  ...(options.idField ? { [options.idField]: snapshot.id } : {}),
                })
              : undefined,
          );
        } catch (error) {
          subscriber.error(error);
        }
      },
      (error) => subscriber.error(error),
    ),
  );
}
