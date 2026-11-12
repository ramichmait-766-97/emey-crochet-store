import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnDestroy,
  ViewChild,
  output,
} from '@angular/core';

let nextDialogId = 0;
let openDialogs = 0;
let originalOverflow = '';

/** Native top-layer dialog owns focus trapping, inert background and focus restoration. */
@Component({
  selector: 'app-dialog',
  standalone: true,
  template: `
    <dialog #dialog [attr.aria-labelledby]="titleId" (cancel)="cancel($event)">
      <header>
        <h2 [id]="titleId" tabindex="-1" #heading>{{ title }}</h2>
        <button
          type="button"
          class="btn ghost"
          aria-label="Close dialog"
          [disabled]="busy"
          (click)="closeRequested.emit()"
        >
          Close ×
        </button>
      </header>
      <div class="dialog-content"><ng-content /></div>
    </dialog>
  `,
  styles: `
    dialog {
      width: min(760px, calc(100vw - 2rem));
      max-width: none;
      max-height: calc(100dvh - 2rem);
      padding: 0;
      border: 1px solid var(--line);
      border-radius: 20px;
      background: var(--cream);
      color: var(--ink);
      overflow: auto;
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
    }
    dialog::backdrop {
      background: rgb(30 22 17 / 0.58);
    }
    header {
      position: sticky;
      top: 0;
      z-index: 2;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 1rem 1.25rem;
      border-bottom: 1px solid var(--line);
      background: var(--cream);
    }
    h2 {
      font: 500 clamp(1.4rem, 4vw, 1.9rem) var(--serif);
      margin: 0;
    }
    .dialog-content {
      padding: 1.25rem;
    }
    @media (max-width: 520px) {
      dialog {
        width: calc(100vw - 1rem);
        max-height: calc(100dvh - 1rem);
        border-radius: 14px;
      }
      header,
      .dialog-content {
        padding: 1rem;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppDialogComponent implements AfterViewInit, OnDestroy {
  @Input({ required: true }) title = '';
  @Input() busy = false;
  @Input() fallbackFocus: HTMLElement | null = null;
  @ViewChild('dialog', { static: true }) dialog!: ElementRef<HTMLDialogElement>;
  @ViewChild('heading', { static: true }) heading!: ElementRef<HTMLHeadingElement>;
  readonly closeRequested = output<void>();
  readonly titleId = `app-dialog-title-${++nextDialogId}`;
  private opener: HTMLElement | null = null;
  ngAfterViewInit(): void {
    const active = this.dialog.nativeElement.ownerDocument.activeElement;
    this.opener = active instanceof HTMLElement ? active : null;
    const root = this.dialog.nativeElement.ownerDocument.documentElement;
    if (openDialogs++ === 0) originalOverflow = root.style.overflow;
    root.style.overflow = 'hidden';
    this.dialog.nativeElement.showModal();
    this.heading.nativeElement.focus();
  }
  cancel(event: Event): void {
    event.preventDefault();
    if (!this.busy) this.closeRequested.emit();
  }
  ngOnDestroy(): void {
    this.dialog.nativeElement.close();
    if (--openDialogs === 0)
      this.dialog.nativeElement.ownerDocument.documentElement.style.overflow = originalOverflow;
    const opener = this.opener;
    const fallback = this.fallbackFocus;
    queueMicrotask(() => {
      const target = opener?.isConnected ? opener : fallback;
      if (target?.isConnected) target.focus({ preventScroll: true });
    });
  }
}
