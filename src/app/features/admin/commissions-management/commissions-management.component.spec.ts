import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CommissionsManagementComponent } from './commissions-management.component';

describe('CommissionsManagementComponent', () => {
  let component: CommissionsManagementComponent;
  let fixture: ComponentFixture<CommissionsManagementComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommissionsManagementComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(CommissionsManagementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
