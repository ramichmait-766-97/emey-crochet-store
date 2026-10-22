import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="shell" style="padding-block:5rem">
      <div class="state-panel">
        <span class="eyebrow">404 / A LOOSE THREAD</span>
        <h1>This page isn't here.</h1>
        <p>Let's find you something beautiful instead.</p>
        <a class="btn primary" routerLink="/shop">Explore the collection</a>
        <a class="btn ghost" routerLink="/">Back to home</a>
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundComponent {}
