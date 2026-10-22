import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, take } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { loginDestination } from '../utils/auth-navigation';

export const guestGuard: CanActivateFn = (route) => {
  const router = inject(Router);
  return inject(AuthService).user$.pipe(
    take(1),
    map((user) =>
      user
        ? router.parseUrl(loginDestination(user.role, route.queryParamMap.get('returnUrl')))
        : true,
    ),
  );
};
