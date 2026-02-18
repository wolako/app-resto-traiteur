import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TermsOfSaleComponent } from './terms-of-sale.component';

describe('TermsOfSaleComponent', () => {
  let component: TermsOfSaleComponent;
  let fixture: ComponentFixture<TermsOfSaleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TermsOfSaleComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(TermsOfSaleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
