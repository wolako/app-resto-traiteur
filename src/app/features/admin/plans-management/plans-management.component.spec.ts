import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PlansManagementComponent } from './plans-management.component';

describe('PlansManagementComponent', () => {
  let component: PlansManagementComponent;
  let fixture: ComponentFixture<PlansManagementComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlansManagementComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(PlansManagementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
