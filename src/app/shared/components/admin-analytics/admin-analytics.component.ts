import { CommonModule } from '@angular/common';
import {
  Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit, NgZone
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AnalyticsService } from '../../../core/services/analytics/analytics.service';
import { Subject, takeUntil } from 'rxjs';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

@Component({
  selector: 'app-admin-analytics',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-analytics.component.html',
  styleUrl: './admin-analytics.component.scss'
})
export class AdminAnalyticsComponent implements OnInit, OnDestroy, AfterViewInit {

  @ViewChild('businessesChart') businessesChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('eventsChart') eventsChartRef!: ElementRef<HTMLCanvasElement>;

  loading = false;
  selectedPeriod = 30;
  globalStats: any = null;

  // ✅ Getters alignés sur la réponse { success, data: { overview, ... } }
  get overview()       { return this.globalStats?.data?.overview       ?? null; }
  get topBusinesses()  { return this.globalStats?.data?.top_businesses ?? []; }
  get eventBreakdown() { return this.globalStats?.data?.event_breakdown ?? []; }

  private businessesChart: Chart | null = null;
  private eventsChart: Chart | null = null;
  private viewInitialized = false;
  private pendingStats: any = null;
  private destroy$ = new Subject<void>();

  constructor(
    private analyticsService: AnalyticsService,
    private ngZone: NgZone
  ) {}

  ngOnInit(): void {
    this.loadData();
  }

  ngAfterViewInit(): void {
    this.viewInitialized = true;
    if (this.pendingStats) {
      // ✅ setTimeout garantit que le DOM canvas est rendu
      setTimeout(() => this.buildCharts(this.pendingStats), 50);
      this.pendingStats = null;
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.destroyCharts();
  }

  private destroyCharts(): void {
    if (this.businessesChart) { this.businessesChart.destroy(); this.businessesChart = null; }
    if (this.eventsChart)     { this.eventsChart.destroy();     this.eventsChart = null; }
  }

  loadData(): void {
    this.loading = true;
    this.analyticsService.getGlobalStats(this.selectedPeriod)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.globalStats = response;
          this.loading = false;
          if (this.viewInitialized) {
            // ✅ setTimeout après fin du cycle de détection de changements
            setTimeout(() => this.buildCharts(response), 100);
          } else {
            this.pendingStats = response;
          }
        },
        error: (err) => {
          console.error('[AdminAnalytics] Erreur:', err);
          this.loading = false;
        }
      });
  }

  onPeriodChange(): void {
    this.loadData();
  }

  // ✅ Vérification canvas disponible avant création du chart
  private canvasReady(ref: ElementRef<HTMLCanvasElement> | undefined): boolean {
    return !!ref?.nativeElement && ref.nativeElement.offsetWidth > 0;
  }

  private buildCharts(response: any): void {
    // ✅ Exécuter hors zone Angular pour éviter les CD inutiles
    this.ngZone.runOutsideAngular(() => {
      const data = response?.data;
      if (!data) return;

      this.buildBusinessesChart(data.top_businesses ?? []);
      this.buildEventsChart(data.event_breakdown ?? []);
    });
  }

  private buildBusinessesChart(top: any[]): void {
    if (!this.canvasReady(this.businessesChartRef)) return;

    if (this.businessesChart) {
      this.businessesChart.destroy();
      this.businessesChart = null;
    }

    if (top.length === 0) return;

    const top8 = top.slice(0, 8);
    this.businessesChart = new Chart(this.businessesChartRef.nativeElement, {
      type: 'bar',
      data: {
        labels: top8.map((b: any) => b.business_name),
        datasets: [
          {
            label: 'Vues de profil',
            data: top8.map((b: any) => +b.page_views || 0),
            backgroundColor: 'rgba(99, 102, 241, 0.75)',
            borderColor: '#6366f1',
            borderWidth: 1,
            borderRadius: 4,
          },
          {
            label: 'Commandes',
            data: top8.map((b: any) => +b.orders_completed || 0),
            backgroundColor: 'rgba(16, 185, 129, 0.75)',
            borderColor: '#10b981',
            borderWidth: 1,
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        plugins: { legend: { position: 'top' } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, ticks: { precision: 0 } },
        },
      },
    });
  }

  private buildEventsChart(events: any[]): void {
    if (!this.canvasReady(this.eventsChartRef)) return;

    if (this.eventsChart) {
      this.eventsChart.destroy();
      this.eventsChart = null;
    }

    if (events.length === 0) return;

    this.eventsChart = new Chart(this.eventsChartRef.nativeElement, {
      type: 'doughnut',
      data: {
        labels: events.map((e: any) => this.getEventLabel(e.event_type)),
        datasets: [
          {
            data: events.map((e: any) => +e.count || 0),
            backgroundColor: [
              '#6366f1', '#10b981', '#f59e0b',
              '#ef4444', '#8b5cf6', '#06b6d4', '#f97316',
            ],
            borderWidth: 2,
            borderColor: '#fff',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        plugins: { legend: { position: 'right' } },
      },
    });
  }

  getEventLabel(type: string): string {
    const labels: Record<string, string> = {
      page_view:             'Vues',
      menu_click:            'Clics menu',
      item_click:            'Clics article',
      order_started:         'Cmd démarrées',
      order_completed:       'Cmd complétées',
      reservation_started:   'Rés. démarrées',
      reservation_completed: 'Rés. complétées',
    };
    return labels[type] ?? type;
  }

  formatNumber(n: number | null | undefined): string {
    if (n == null) return '0';
    return Math.round(n).toLocaleString('fr-FR');
  }
}