import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DriverForgotPasswordComponent } from './driver-forgot-password.component';

describe('DriverForgotPasswordComponent', () => {
  let component: DriverForgotPasswordComponent;
  let fixture: ComponentFixture<DriverForgotPasswordComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DriverForgotPasswordComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(DriverForgotPasswordComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
