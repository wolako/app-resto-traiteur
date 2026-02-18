import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MenuItemsModalComponent } from './menu-items-modal.component';

describe('MenuItemsModalComponent', () => {
  let component: MenuItemsModalComponent;
  let fixture: ComponentFixture<MenuItemsModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MenuItemsModalComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(MenuItemsModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
