import { CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  HostListener,
  ViewChild,
  ElementRef,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { PRODUCT_CATEGORIES } from '../../core/constants/store.constants';
import { Product } from '../../core/models/product.model';
import { ContactMethod, SiteSettings } from '../../core/models/site-settings.model';
import { AdminStoreService, ProductDraft } from '../../core/services/admin-store.service';
import { SiteSettingsService } from '../../core/services/site-settings.service';
import { productImageSrc } from '../../core/utils/product-image';
import { ImageKitPipe, ImageKitSrcsetPipe } from '../../shared/pipes/imagekit.pipe';
import { ImageFallbackDirective } from '../../shared/directives/image-fallback.directive';
import { AdminNavComponent } from '../../shared/components/admin-nav.component';
import { AppDialogComponent } from '../../shared/components/app-dialog.component';

@Component({
  standalone: true,
  imports: [
    CurrencyPipe,
    FormsModule,
    ImageKitPipe,
    ImageKitSrcsetPipe,
    ImageFallbackDirective,
    AdminNavComponent,
    AppDialogComponent,
  ],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminComponent implements OnInit {
  readonly categories = PRODUCT_CATEGORIES;
  readonly admin = inject(AdminStoreService);
  readonly siteSettings = inject(SiteSettingsService);
  private readonly cdr = inject(ChangeDetectorRef);

  tab: 'products' | 'settings' = 'products';
  showEditor = false;
  saving = false;
  error = '';
  notice = '';
  productSearch = '';
  productStatus = '';
  selectedFile?: File;
  galleryFiles: File[] = [];
  selectedPreview = '';
  draft: ProductDraft = this.emptyProduct();
  settingsDraft?: SiteSettings;
  @ViewChild('newProductButton') newProductButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('editorError') set editorError(element: ElementRef<HTMLElement> | undefined) {
    element?.nativeElement.focus();
  }
  visibleProducts(): Product[] {
    const query = this.productSearch.trim().toLocaleLowerCase();
    return this.admin
      .products()
      .filter(
        (product) =>
          (!query ||
            `${product.name} ${product.id} ${product.category}`
              .toLocaleLowerCase()
              .includes(query)) &&
          (!this.productStatus || product.active === (this.productStatus === 'active')),
      );
  }
  discardPrompt = false;
  private originalDraft = '';
  private originalSettings = '';
  private leaveDecision?: (leave: boolean) => void;

  get productDirty(): boolean {
    return (
      this.showEditor &&
      (JSON.stringify(this.draft) !== this.originalDraft ||
        !!this.selectedFile ||
        this.galleryFiles.length > 0)
    );
  }
  get settingsDirty(): boolean {
    return !!this.settingsDraft && JSON.stringify(this.settingsDraft) !== this.originalSettings;
  }
  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.productDirty || this.settingsDirty || this.saving) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
  canLeave(): boolean | Promise<boolean> {
    if (this.saving) return false;
    if (!this.productDirty && !this.settingsDirty) return true;
    this.discardPrompt = true;
    this.cdr.markForCheck();
    return new Promise<boolean>((resolve) => {
      this.leaveDecision = resolve;
    });
  }
  decideDiscard(discard: boolean): void {
    this.discardPrompt = false;
    if (discard) this.finishClose();
    this.leaveDecision?.(discard);
    this.leaveDecision = undefined;
  }

  async ngOnInit(): Promise<void> {
    void this.admin.loadProducts(true);
    try {
      const settings = await firstValueFrom(this.siteSettings.settings$);
      this.beginSettings(settings);
    } catch {
      this.error = 'Unable to load store settings. Please refresh and try again.';
    } finally {
      this.cdr.markForCheck();
    }
  }

  openNew(): void {
    this.galleryFiles = [];
    this.draft = this.emptyProduct();
    this.selectedFile = undefined;
    this.selectedPreview = '';
    this.showEditor = true;
    this.originalDraft = JSON.stringify(this.draft);
    this.clearMessages();
  }

  edit(product: Product): void {
    this.galleryFiles = [];
    this.draft = {
      ...product,
      gallery: [...product.gallery],
      colors: [...product.colors],
      variants: (product.variants || []).map((item) => ({ ...item })),
    };
    this.selectedFile = undefined;
    this.selectedPreview = '';
    this.showEditor = true;
    this.originalDraft = JSON.stringify(this.draft);
    this.clearMessages();
  }

  closeEditor(): void {
    if (this.saving) return;
    if (this.productDirty) {
      this.discardPrompt = true;
      return;
    }
    this.finishClose();
  }
  private finishClose(): void {
    this.showEditor = false;
    this.selectedFile = undefined;
    this.selectedPreview = '';
    this.galleryFiles = [];
  }

  pickFile(event: Event): void {
    this.selectedFile = (event.target as HTMLInputElement).files?.[0];
    this.selectedPreview = '';
    if (!this.selectedFile) {
      return;
    }

    const reader = new FileReader();
    const selectedFile = this.selectedFile;
    reader.onload = () => {
      if (this.selectedFile !== selectedFile) return;
      this.selectedPreview = typeof reader.result === 'string' ? reader.result : '';
      this.cdr.markForCheck();
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
  pickGallery(event: Event): void {
    this.galleryFiles = Array.from((event.target as HTMLInputElement).files || []);
  }
  addVariant(): void {
    this.draft.variants ??= [];
    this.draft.variants.push({
      id: crypto.randomUUID().slice(0, 8),
      color: '',
      size: '',
      quantity: 0,
      price: this.draft.price,
    });
  }
  removeVariant(id: string): void {
    this.draft.variants = this.draft.variants?.filter((item) => item.id !== id);
  }

  async saveProduct(): Promise<void> {
    if (this.saving) return;
    if (!this.draft.id.trim() || !this.draft.name.trim()) {
      this.error = 'Product ID and name are required.';
      return;
    }
    if (
      !this.draft.description.trim() ||
      typeof this.draft.price !== 'number' ||
      !Number.isFinite(this.draft.price) ||
      this.draft.price < 0 ||
      !Number.isInteger(this.draft.quantity) ||
      this.draft.quantity < 0
    ) {
      this.error =
        'Add a description, a valid price and a whole available quantity of zero or more.';
      return;
    }

    await this.runSave(async () => {
      await this.admin.saveProduct(this.draft, this.selectedFile, this.galleryFiles);
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
      this.originalSettings = JSON.stringify(this.settingsDraft);
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
    if (this.siteSettings.loadError()) {
      this.error = 'Settings could not load. Please refresh before saving.';
      return;
    }
    await this.runSave(async () => {
      await this.admin.saveSettings(this.settingsDraft!);
      this.originalSettings = JSON.stringify(this.settingsDraft);
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
      this.cdr.markForCheck();
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
