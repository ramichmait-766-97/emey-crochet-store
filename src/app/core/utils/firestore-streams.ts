import { DocumentData, DocumentReference, Query, onSnapshot } from 'firebase/firestore';
import { Observable } from 'rxjs';

export function collectionData<T>(
  query: Query<DocumentData>,
  options: { idField?: string } = {},
): Observable<T[]> {
  return new Observable((subscriber) =>
    onSnapshot(
      query,
      (snapshot) => {
        subscriber.next(
          snapshot.docs.map(
            (doc) =>
              ({ ...doc.data(), ...(options.idField ? { [options.idField]: doc.id } : {}) }) as T,
          ),
        );
      },
      (error) => subscriber.error(error),
    ),
  );
}

export function docData<T>(
  ref: DocumentReference<DocumentData>,
  options: { idField?: string } = {},
): Observable<T | undefined> {
  return new Observable((subscriber) =>
    onSnapshot(
      ref,
      (snapshot) => {
        subscriber.next(
          snapshot.exists()
            ? ({
                ...snapshot.data(),
                ...(options.idField ? { [options.idField]: snapshot.id } : {}),
              } as T)
            : undefined,
        );
      },
      (error) => subscriber.error(error),
    ),
  );
}
