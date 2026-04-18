import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SpecialOrderDetailsModalComponent } from './special-order-details-modal.component';

describe('SpecialOrderDetailsModalComponent', () => {
  let component: SpecialOrderDetailsModalComponent;
  let fixture: ComponentFixture<SpecialOrderDetailsModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SpecialOrderDetailsModalComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(SpecialOrderDetailsModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
