import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MaintenanceModalComponent } from './maintenance-modal.component';

describe('MaintenanceModalComponent', () => {
  let component: MaintenanceModalComponent;
  let fixture: ComponentFixture<MaintenanceModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MaintenanceModalComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(MaintenanceModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
