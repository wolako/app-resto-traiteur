import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SubmitTestimonialComponent } from './submit-testimonial.component';

describe('SubmitTestimonialComponent', () => {
  let component: SubmitTestimonialComponent;
  let fixture: ComponentFixture<SubmitTestimonialComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SubmitTestimonialComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(SubmitTestimonialComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
