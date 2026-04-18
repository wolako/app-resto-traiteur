import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TraiteurProfileComponent } from './traiteur-profile.component';

describe('TraiteurProfileComponent', () => {
  let component: TraiteurProfileComponent;
  let fixture: ComponentFixture<TraiteurProfileComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TraiteurProfileComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(TraiteurProfileComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
