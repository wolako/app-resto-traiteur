import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Business } from '../../models/business.model';
import { environment } from '../../../../environments/environment';
import { Menu, MenuItem } from '../../models/menu.model';

@Injectable({
  providedIn: 'root'
})
export class BusinessService {

  constructor(private http: HttpClient) {}

  // Business operations
  getBusinesses(): Observable<Business[]> {
    return this.http.get<Business[]>(`${environment.apiUrl}/businesses`);
  }

  getAvailableCaterers(): Observable<Business[]> {
    return this.http.get<Business[]>(`${environment.apiUrl}/businesses/caterers/available`);
  }

  getRestaurants(): Observable<Business[]> {
    return this.http.get<Business[]>(`${environment.apiUrl}/businesses/restaurants`);
  }

  updateBusiness(id: number, business: Partial<Business>): Observable<Business> {
    return this.http.put<Business>(`${environment.apiUrl}/businesses/${id}`, business);
  }

  updateAvailability(id: number, isAvailable: boolean): Observable<Business> {
    return this.http.patch<Business>(`${environment.apiUrl}/businesses/${id}/availability`, {
      is_available: isAvailable
    });
  }

  updateHours(id: number, hours: { opening_hour?: string; closing_hour?: string; availability_start?: string; availability_end?: string }): Observable<Business> {
    return this.http.patch<Business>(`${environment.apiUrl}/businesses/${id}/hours`, hours);
  }

  // Menu operations
  getBusinessMenus(businessId: number): Observable<Menu[]> {
    return this.http.get<Menu[]>(`${environment.apiUrl}/businesses/${businessId}/menus`);
  }

  createMenu(businessId: number, menu: Omit<Menu, 'id'>): Observable<Menu> {
    return this.http.post<Menu>(`${environment.apiUrl}/businesses/${businessId}/menus`, menu);
  }

  updateMenu(menuId: number, menu: Partial<Menu>): Observable<Menu> {
    return this.http.put<Menu>(`${environment.apiUrl}/menus/${menuId}`, menu);
  }

  deleteMenu(menuId: number): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/menus/${menuId}`);
  }

  // Menu items operations
  createMenuItem(menuId: number, item: Omit<MenuItem, 'id'>): Observable<MenuItem> {
    return this.http.post<MenuItem>(`${environment.apiUrl}/menus/${menuId}/items`, item);
  }

  updateMenuItem(itemId: number, item: Partial<MenuItem>): Observable<MenuItem> {
    return this.http.put<MenuItem>(`${environment.apiUrl}/menu-items/${itemId}`, item);
  }

  deleteMenuItem(itemId: number): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/menu-items/${itemId}`);
  }

  getMenuItems(menuId: number): Observable<MenuItem[]> {
    return this.http.get<MenuItem[]>(`${environment.apiUrl}/menus/${menuId}/items`);
  }
}