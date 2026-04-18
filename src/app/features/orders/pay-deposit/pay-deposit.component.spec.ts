import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PayDepositComponent } from './pay-deposit.component';

describe('PayDepositComponent', () => {
  let component: PayDepositComponent;
  let fixture: ComponentFixture<PayDepositComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PayDepositComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(PayDepositComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
