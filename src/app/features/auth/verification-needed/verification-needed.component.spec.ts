import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VerificationNeededComponent } from './verification-needed.component';

describe('VerificationNeededComponent', () => {
  let component: VerificationNeededComponent;
  let fixture: ComponentFixture<VerificationNeededComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VerificationNeededComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(VerificationNeededComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
