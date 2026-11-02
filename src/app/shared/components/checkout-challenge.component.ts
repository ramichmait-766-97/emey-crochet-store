import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  output,
} from '@angular/core';
import { environment } from '../../../environments/environment';

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string;
      remove: (id: string) => void;
    };
  }
}
let scriptReady: Promise<void> | undefined;
@Component({
  selector: 'app-checkout-challenge',
  standalone: true,
  template:
    '<div #challenge></div><p class="hint">A security check protects limited handmade stock from automated reservations.</p>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutChallengeComponent implements AfterViewInit, OnDestroy {
  @ViewChild('challenge', { static: true }) element!: ElementRef<HTMLElement>;
  readonly completed = output<string>();
  readonly failed = output<string>();
  private widget = '';
  private destroyed = false;
  async ngAfterViewInit(): Promise<void> {
    if (!environment.commerce.turnstileSiteKey) {
      this.failed.emit('Checkout security has not been configured.');
      return;
    }
    try {
      scriptReady ??= new Promise<void>((resolve, reject) => {
        if (window.turnstile) {
          resolve();
          return;
        }
        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => {
          scriptReady = undefined;
          reject(new Error('Security check unavailable.'));
        };
        document.head.appendChild(script);
      });
      await scriptReady;
      if (this.destroyed) return;
      this.widget = window.turnstile!.render(this.element.nativeElement, {
        sitekey: environment.commerce.turnstileSiteKey,
        action: 'checkout',
        callback: (token: string) => this.completed.emit(token),
        'expired-callback': () => this.completed.emit(''),
        'error-callback': () => {
          this.completed.emit('');
          this.failed.emit('Security check failed. Review your total again to retry.');
        },
      });
    } catch {
      this.failed.emit(
        'Unable to load security check. Check your connection and review the total again.',
      );
    }
  }
  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.widget) window.turnstile?.remove(this.widget);
  }
}
