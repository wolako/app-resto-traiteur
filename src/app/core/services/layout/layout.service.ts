// core/services/layout/layout.service.ts

import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LayoutService {
  // Signal Angular : true = footer plateforme caché
  readonly hideFooter = signal(false);

  showPlatformFooter(): void  { this.hideFooter.set(false); }
  hidePlatformFooter(): void  { this.hideFooter.set(true);  }
}