import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BrandingSettingComponent } from './branding-setting.component';

describe('BrandingSettingComponent', () => {
  let component: BrandingSettingComponent;
  let fixture: ComponentFixture<BrandingSettingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BrandingSettingComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(BrandingSettingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
