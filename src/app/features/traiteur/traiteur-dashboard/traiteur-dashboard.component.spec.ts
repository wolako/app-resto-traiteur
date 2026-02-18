import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TraiteurDashboardComponent } from './traiteur-dashboard.component';

describe('TraiteurDashboardComponent', () => {
  let component: TraiteurDashboardComponent;
  let fixture: ComponentFixture<TraiteurDashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TraiteurDashboardComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(TraiteurDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
