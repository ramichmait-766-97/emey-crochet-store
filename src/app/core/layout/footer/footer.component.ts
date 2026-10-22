import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SiteSettingsService } from '../../services/site-settings.service';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [AsyncPipe, RouterLink],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FooterComponent {
  readonly settings = inject(SiteSettingsService);
  readonly year = new Date().getFullYear();
}
