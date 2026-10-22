import { AsyncPipe, CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { PRODUCT_CATEGORIES } from '../../core/constants/store.constants';
import { Product } from '../../core/models/product.model';
import { ContactMethod, SiteSettings } from '../../core/models/site-settings.model';
import { AdminStoreService, ProductDraft } from '../../core/services/admin-store.service';
import { SiteSettingsService } from '../../core/services/site-settings.service';
import { environment } from '../../../environments/environment';
import { productImageSrc } from '../../core/utils/product-image';
import { ProductImagePipe } from '../../shared/pipes/product-image.pipe';

@Component({
  standalone: true,
  imports: [AsyncPipe, CurrencyPipe, FormsModule, ProductImagePipe],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminComponent implements OnInit {
  readonly environment = environment;
  readonly categories = PRODUCT_CATEGORIES;
  readonly admin = inject(AdminStoreService);
  readonly siteSettings = inject(SiteSettingsService);

  tab: 'products' | 'settings' = 'products';
  showEditor = false;
  saving = false;
  error = '';
  notice = '';
  selectedFile?: File;
  selectedPreview = '';
  draft: ProductDraft = this.emptyProduct();
  settingsDraft?: SiteSettings;

  async ngOnInit(): Promise<void> {
    const settings = await firstValueFrom(this.siteSettings.settings$);
    this.beginSettings(settings);
  }

  openNew(): void {
    this.draft = this.emptyProduct();
    this.selectedFile = undefined;
    this.selectedPreview = '';
    this.showEditor = true;
    this.clearMessages();
  }

  edit(product: Product): void {
    this.draft = { ...product, gallery: [...product.gallery], colors: [...product.colors] };
    this.selectedFile = undefined;
    this.selectedPreview = '';
    this.showEditor = true;
    this.clearMessages();
  }

  closeEditor(): void {
    this.showEditor = false;
    this.selectedFile = undefined;
    this.selectedPreview = '';
  }

  pickFile(event: Event): void {
    this.selectedFile = (event.target as HTMLInputElement).files?.[0];
    this.selectedPreview = '';
    if (!this.selectedFile) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      this.selectedPreview = typeof reader.result === 'string' ? reader.result : '';
    };
    reader.readAsDataURL(this.selectedFile);
  }

  currentImage(product: Product): string {
    return this.selectedPreview || productImageSrc(product);
  }

  colorsChanged(value: string): void {
    this.draft.colors = value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  async saveProduct(): Promise<void> {
    if (!this.draft.id.trim() || !this.draft.name.trim()) {
      this.error = 'Product ID and name are required.';
      return;
    }

    await this.runSave(async () => {
      await this.admin.saveProduct(this.draft, this.selectedFile);
      this.showEditor = false;
      this.notice = 'Product saved successfully.';
    });
  }

  beginSettings(settings: SiteSettings): void {
    if (!this.settingsDraft) {
      this.settingsDraft = {
        ...settings,
        contacts: settings.contacts.map((contact) => ({ ...contact })),
      };
    }
  }

  addContact(): void {
    if (!this.settingsDraft) return;
    const next: ContactMethod = {
      id: `contact-${Date.now()}`,
      type: 'custom',
      label: 'Contact',
      value: '',
      url: '',
      enabled: true,
    };
    this.settingsDraft.contacts = [...this.settingsDraft.contacts, next];
  }

  removeContact(id: string): void {
    if (!this.settingsDraft) return;
    this.settingsDraft.contacts = this.settingsDraft.contacts.filter((item) => item.id !== id);
  }

  async saveSettings(): Promise<void> {
    if (!this.settingsDraft) return;
    await this.runSave(async () => {
      await this.admin.saveSettings(this.settingsDraft!);
      this.notice = 'Store settings saved successfully.';
    });
  }

  private async runSave(action: () => Promise<void>): Promise<void> {
    this.saving = true;
    this.clearMessages();
    try {
      await action();
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Unable to save changes.';
    } finally {
      this.saving = false;
    }
  }

  private clearMessages(): void {
    this.error = '';
    this.notice = '';
  }

  private emptyProduct(): ProductDraft {
    return {
      id: '',
      slug: '',
      name: '',
      category: 'Apparel',
      description: '',
      price: 0,
      quantity: 0,
      imageUrl: '',
      gallery: [],
      colors: [],
      bestSeller: false,
      newArrival: false,
      active: true,
    };
  }
}
