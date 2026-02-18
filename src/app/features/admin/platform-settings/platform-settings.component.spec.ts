import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PlatformSettingsComponent } from './platform-settings.component';

describe('PlatformSettingsComponent', () => {
  let component: PlatformSettingsComponent;
  let fixture: ComponentFixture<PlatformSettingsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlatformSettingsComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(PlatformSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
