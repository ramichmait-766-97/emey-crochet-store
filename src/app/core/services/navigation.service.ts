import { Injectable, inject } from '@angular/core';
import { ViewportScroller } from '@angular/common';
import { Router, Scroll } from '@angular/router';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

/** Keep filter changes steady; restore history and reset only when changing pages. */
@Injectable({ providedIn: 'root' })
export class NavigationService {
  constructor() {
    const viewport = inject(ViewportScroller);
    let previousPath = '';
    viewport.setOffset([0, 150]);
    inject(Router)
      .events.pipe(
        filter((event): event is Scroll => event instanceof Scroll),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        const url =
          'urlAfterRedirects' in event.routerEvent
            ? event.routerEvent.urlAfterRedirects
            : event.routerEvent.url;
        const path = url.split(/[?#]/)[0];
        if (event.position) viewport.scrollToPosition(event.position);
        else if (event.anchor) viewport.scrollToAnchor(event.anchor);
        else if (path !== previousPath) viewport.scrollToPosition([0, 0]);
        previousPath = path;
      });
  }
}
