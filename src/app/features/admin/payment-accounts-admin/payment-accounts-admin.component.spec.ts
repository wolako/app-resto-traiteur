import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PaymentAccountsAdminComponent } from './payment-accounts-admin.component';

describe('PaymentAccountsAdminComponent', () => {
  let component: PaymentAccountsAdminComponent;
  let fixture: ComponentFixture<PaymentAccountsAdminComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PaymentAccountsAdminComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(PaymentAccountsAdminComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
