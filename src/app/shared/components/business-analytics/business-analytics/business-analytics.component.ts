import { Component, Input, OnDestroy, OnInit,
  ViewChild, ElementRef, AfterViewInit, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  AnalyticsOverview, AnalyticsService,
  ConversionPoint, PopularItem, TimelinePoint
} from '../../../../core/services/analytics/analytics.service';
import { forkJoin, Subject, takeUntil } from 'rxjs';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

@Component({
  selector: 'app-business-analytics',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './business-analytics.component.html',
  styleUrl: './business-analytics.component.scss'
})
export class BusinessAnalyticsComponent implements OnInit, OnDestroy, AfterViewInit {
  @Input() businessId!: number;
  // ✅ NOUVEAU : type du business pour adapter l'affichage
  @Input() businessType: 'restaurant' | 'traiteur' = 'restaurant';

  @ViewChild('timelineCanvas')   timelineCanvas!:   ElementRef<HTMLCanvasElement>;
  @ViewChild('conversionCanvas') conversionCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('popularCanvas')    popularCanvas!:    ElementRef<HTMLCanvasElement>;

  loading = false;
  selectedPeriod = 30;
  overview: AnalyticsOverview | null = null;
  popularItems: PopularItem[] = [];

  private timelineChart:   Chart | null = null;
  private conversionChart: Chart | null = null;
  private popularChart:    Chart | null = null;

  private viewInitialized     = false;
  private pendingTimeline:   TimelinePoint[]   | null = null;
  private pendingConversion: ConversionPoint[] | null = null;
  private pendingPopular:    PopularItem[]     | null = null;

  private destroy$ = new Subject<void>();

  constructor(
    private analyticsService: AnalyticsService,
    private ngZone: NgZone
  ) {}

  ngOnInit(): void { this.loadData(); }

  ngAfterViewInit(): void {
    this.viewInitialized = true;
    if (this.pendingTimeline || this.pendingConversion || this.pendingPopular) {
      setTimeout(() => {
        if (this.pendingTimeline)   this.buildTimelineChart(this.pendingTimeline);
        if (this.pendingConversion) this.buildConversionChart(this.pendingConversion);
        if (this.pendingPopular)    this.buildPopularChart(this.pendingPopular);
        this.pendingTimeline = this.pendingConversion = this.pendingPopular = null;
      }, 80);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.destroyAll();
  }

  private destroyAll(): void {
    this.timelineChart?.destroy();
    this.conversionChart?.destroy();
    this.popularChart?.destroy();
    this.timelineChart = this.conversionChart = this.popularChart = null;
  }

  private canvasReady(ref: ElementRef<HTMLCanvasElement> | undefined): boolean {
    return !!ref?.nativeElement && ref.nativeElement.offsetWidth > 0;
  }

  loadData(): void {
    if (!this.businessId) return;
    this.loading = true;

    forkJoin({
      overview:     this.analyticsService.getBusinessOverview(this.businessId, this.selectedPeriod),
      popularItems: this.analyticsService.getPopularItems(this.businessId, this.selectedPeriod),
      timeline:     this.analyticsService.getTimeline(this.businessId, this.selectedPeriod),
      conversion:   this.analyticsService.getConversionRate(this.businessId, this.selectedPeriod),
    }).pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ overview, popularItems, timeline, conversion }) => {
          this.overview     = overview;
          this.popularItems = popularItems;
          // ✅ Déduire le type depuis la réponse si non fourni en @Input
          if ((overview as any).business_type) {
            this.businessType = (overview as any).business_type;
          }
          this.loading = false;

          if (this.viewInitialized) {
            setTimeout(() => {
              this.buildTimelineChart(timeline);
              this.buildConversionChart(conversion);
              this.buildPopularChart(popularItems);
            }, 100);
          } else {
            this.pendingTimeline   = timeline;
            this.pendingConversion = conversion;
            this.pendingPopular    = popularItems;
          }
        },
        error: () => { this.loading = false; },
      });
  }

  onPeriodChange(): void { this.loadData(); }

  // ── Getters adaptés au type ─────────────────────────────────

  get isTraiteur(): boolean { return this.businessType === 'traiteur'; }

  /** Commandes à afficher : special_orders pour traiteur, orders pour restaurant */
  get ordersCompleted(): number {
    if (!this.overview) return 0;
    const ov = this.overview as any;
    return this.isTraiteur
      ? (ov.real_special_orders_count ?? ov.total_orders_completed ?? 0)
      : (ov.real_orders_count ?? ov.total_orders_completed ?? 0);
  }

  get ordersLabel(): string {
    return this.isTraiteur ? 'Commandes spéciales' : 'Commandes';
  }

  get conversionLabel(): string {
    return this.isTraiteur ? 'Taux conversion (vues→cmd)' : 'Taux conversion';
  }

  // ─── Charts ────────────────────────────────────────────────

  private buildTimelineChart(data: TimelinePoint[]): void {
    if (!this.canvasReady(this.timelineCanvas)) return;
    this.ngZone.runOutsideAngular(() => {
      this.timelineChart?.destroy();
      if (!data.length) return;

      const labels = data.map(d =>
        new Date(d.period).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
      );

      const datasets: any[] = [
        {
          label: 'Visites',
          data: data.map(d => +d.page_views || 0),
          borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.1)',
          fill: true, tension: 0.4, pointRadius: 3, pointHoverRadius: 6,
        },
      ];

      if (this.isTraiteur) {
        // ✅ Traiteurs : afficher commandes spéciales réelles
        datasets.push({
          label: 'Commandes spéciales',
          data: data.map(d => ((d as any).special_orders_count ?? (+d.orders_completed || 0))),
          borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)',
          fill: true, tension: 0.4, pointRadius: 3, pointHoverRadius: 6,
        });
      } else {
        // Restaurants : commandes + réservations
        datasets.push(
          {
            label: 'Commandes',
            data: data.map(d => +d.orders_completed || 0),
            borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)',
            fill: true, tension: 0.4, pointRadius: 3, pointHoverRadius: 6,
          },
          {
            label: 'Réservations',
            data: data.map(d => +d.reservations_completed || 0),
            borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)',
            fill: true, tension: 0.4, pointRadius: 3, pointHoverRadius: 6,
          }
        );
      }

      this.timelineChart = new Chart(this.timelineCanvas.nativeElement, {
        type: 'line',
        data: { labels, datasets },
        options: {
          responsive: true, maintainAspectRatio: false,
          animation: { duration: 400 },
          interaction: { mode: 'index', intersect: false },
          plugins: { legend: { position: 'top' }, tooltip: { mode: 'index' } },
          scales: {
            x: { grid: { display: false } },
            y: { beginAtZero: true, ticks: { precision: 0 } },
          },
        },
      });
    });
  }

  private buildConversionChart(data: ConversionPoint[]): void {
    if (!this.canvasReady(this.conversionCanvas)) return;
    this.ngZone.runOutsideAngular(() => {
      this.conversionChart?.destroy();
      if (!data.length) return;

      const labels = data.map(d =>
        new Date(d.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
      );

      // ✅ Traiteurs : afficher les commandes spéciales par jour au lieu du taux
      const chartData = this.isTraiteur
        ? data.map(d => ((d as any).special_orders_count ?? (+d.orders_completed || 0)))
        : data.map(d => +d.order_conversion_rate || 0);

      this.conversionChart = new Chart(this.conversionCanvas.nativeElement, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: this.isTraiteur ? 'Commandes spéciales / jour' : 'Taux de conversion (%)',
            data: chartData,
            backgroundColor: 'rgba(99,102,241,0.7)',
            borderColor: '#6366f1', borderWidth: 1, borderRadius: 4,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          animation: { duration: 400 },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: ctx => this.isTraiteur
                  ? `${ctx.parsed.y} commandes`
                  : `${(ctx.parsed.y ?? 0).toFixed(1)}%`,
              },
            },
          },
          scales: {
            y: {
              beginAtZero: true,
              ...(this.isTraiteur ? {} : { max: 100 }),
              ticks: {
                callback: (v: any) => this.isTraiteur ? v : `${v}%`,
              },
            },
            x: { grid: { display: false } },
          },
        },
      });
    });
  }

  private buildPopularChart(items: PopularItem[]): void {
    if (!this.canvasReady(this.popularCanvas)) return;
    this.ngZone.runOutsideAngular(() => {
      this.popularChart?.destroy();
      const top5 = items.slice(0, 5);
      if (!top5.length) return;

      this.popularChart = new Chart(this.popularCanvas.nativeElement, {
        type: 'doughnut',
        data: {
          labels: top5.map(i => i.item_name),
          datasets: [{
            data: top5.map(i => i.total_orders || i.total_clicks || 0),
            backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'],
            borderWidth: 2, borderColor: '#fff',
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          animation: { duration: 400 },
          plugins: {
            legend: { position: 'right' },
            tooltip: {
              callbacks: {
                label: ctx => ` ${ctx.label}: ${ctx.parsed} ${this.isTraiteur ? 'commandes' : 'interactions'}`,
              },
            },
          },
        },
      });
    });
  }

  formatNumber(n: number | null | undefined): string {
    if (n == null) return '0';
    return Math.round(n).toLocaleString('fr-FR');
  }

  formatPercent(n: number | null | undefined): string {
    if (n == null) return '0%';
    return `${Number(n).toFixed(1)}%`;
  }
}