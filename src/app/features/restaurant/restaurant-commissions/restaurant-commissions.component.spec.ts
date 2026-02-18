import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RestaurantCommissionsComponent } from './restaurant-commissions.component';

describe('RestaurantCommissionsComponent', () => {
  let component: RestaurantCommissionsComponent;
  let fixture: ComponentFixture<RestaurantCommissionsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RestaurantCommissionsComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(RestaurantCommissionsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
