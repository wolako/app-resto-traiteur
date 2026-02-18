import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CommissionsViewComponent } from './commissions-view.component';

describe('CommissionsViewComponent', () => {
  let component: CommissionsViewComponent;
  let fixture: ComponentFixture<CommissionsViewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommissionsViewComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(CommissionsViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
