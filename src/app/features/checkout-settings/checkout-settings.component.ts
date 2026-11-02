import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, HostListener, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CheckoutSettings } from '../../core/models/commerce.model';
import { decodeSettingsResponse } from '../../types/commerce.contracts';
import { CommerceService } from '../../core/services/commerce.service';

@Component({
  standalone: true,
  imports: [FormsModule, RouterLink, CurrencyPipe],
  templateUrl: './checkout-settings.component.html',
  styleUrl: '../commerce.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutSettingsComponent {
  readonly api = inject(CommerceService);
  readonly settings = signal<CheckoutSettings | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly leavePrompt = signal(false);
  private leaveDecision?: (leave: boolean) => void;
  dirty = false;
  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.dirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
  constructor() {
    void this.load();
  }
  canLeave(): boolean | Promise<boolean> {
    if (!this.dirty) return true;
    this.leavePrompt.set(true);
    return new Promise<boolean>((resolve) => {
      this.leaveDecision = resolve;
    });
  }
  decideLeave(leave: boolean): void {
    this.leavePrompt.set(false);
    if (leave) this.dirty = false;
    this.leaveDecision?.(leave);
  }
  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.settings.set(await this.api.settings());
      this.dirty = false;
    } catch {
      this.error.set('Settings could not load. Check your connection and retry.');
    } finally {
      this.loading.set(false);
    }
  }
  async seed(): Promise<void> {
    await this.saveAction('/admin/settings/seed', {});
  }
  async save(): Promise<void> {
    await this.saveAction('/admin/settings/save', this.settings());
  }
  private async saveAction(path: string, data: unknown): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      const result = await this.api.call(path, data, decodeSettingsResponse);
      this.settings.set(result.settings);
      this.dirty = false;
      this.notice.set(
        path.endsWith('seed')
          ? 'Draft configuration created. Confirm each option before enabling checkout.'
          : 'Checkout settings saved. New orders use these rules.',
      );
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to save settings.');
    } finally {
      this.saving.set(false);
    }
  }
  addZone(): void {
    this.settings()?.zones.push({
      id: `zone-${crypto.randomUUID().slice(0, 8)}`,
      label: '',
      feeCents: 0,
      estimate: '',
      enabled: false,
    });
    this.dirty = true;
  }
  addPayment(): void {
    this.settings()?.paymentMethods.push({
      id: `pay-${crypto.randomUUID().slice(0, 8)}`,
      label: '',
      instructions: '',
      enabled: false,
    });
    this.dirty = true;
  }
}
