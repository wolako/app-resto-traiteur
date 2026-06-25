import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DriverResetPasswordComponent } from './driver-reset-password.component';

describe('DriverResetPasswordComponent', () => {
  let component: DriverResetPasswordComponent;
  let fixture: ComponentFixture<DriverResetPasswordComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DriverResetPasswordComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(DriverResetPasswordComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
