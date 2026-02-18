import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TraiteurCommissionsComponent } from './traiteur-commissions.component';

describe('TraiteurCommissionsComponent', () => {
  let component: TraiteurCommissionsComponent;
  let fixture: ComponentFixture<TraiteurCommissionsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TraiteurCommissionsComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(TraiteurCommissionsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
