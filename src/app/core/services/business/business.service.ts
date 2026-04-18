// core/services/business/business.service.ts

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Business, BusinessPublicProfile } from '../../models/business.model';
import { environment } from '../../../../environments/environment';
import { Menu, MenuItem } from '../../models/menu.model';

@Injectable({ providedIn: 'root' })
export class BusinessService {

  constructor(private http: HttpClient) {}

  // ── Listes publiques ────────────────────────────────────────
  getBusinesses(): Observable<Business[]> {
    return this.http.get<Business[]>(`${environment.apiUrl}/businesses`);
  }

  getAvailableCaterers(): Observable<Business[]> {
    return this.http.get<Business[]>(`${environment.apiUrl}/businesses/caterers/available`);
  }

  getRestaurants(): Observable<Business[]> {
    return this.http.get<Business[]>(`${environment.apiUrl}/businesses/restaurants`);
  }

  getBusinessById(id: number): Observable<Business> {
    return this.http.get<Business>(`${environment.apiUrl}/businesses/${id}`);
  }

  // ✅ NOUVEAU : Profil public complet (branding + menus + reviews)
  getPublicProfile(id: number): Observable<BusinessPublicProfile> {
    return this.http.get<{ success: boolean; data: BusinessPublicProfile }>(
      `${environment.apiUrl}/businesses/${id}/profile`
    ).pipe(map(res => res.data));
  }

  // ── Mise à jour ─────────────────────────────────────────────
  updateBusiness(id: number, business: Partial<Business>): Observable<Business> {
    return this.http.put<Business>(`${environment.apiUrl}/businesses/${id}`, business);
  }

  updateAvailability(id: number, isAvailable: boolean): Observable<Business> {
    return this.http.patch<Business>(`${environment.apiUrl}/businesses/${id}/availability`, {
      is_available: isAvailable
    });
  }

  updateHours(id: number, hours: {
    opening_hour?: string; closing_hour?: string;
    availability_start?: string; availability_end?: string;
  }): Observable<Business> {
    return this.http.patch<Business>(`${environment.apiUrl}/businesses/${id}/hours`, hours);
  }

  // ── Menus ───────────────────────────────────────────────────
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

  // ── Menu items ──────────────────────────────────────────────
  getMenuItems(menuId: number): Observable<MenuItem[]> {
    return this.http.get<MenuItem[]>(`${environment.apiUrl}/menus/${menuId}/items`);
  }

  createMenuItem(menuId: number, item: Omit<MenuItem, 'id'>): Observable<MenuItem> {
    return this.http.post<MenuItem>(`${environment.apiUrl}/menus/${menuId}/items`, item);
  }

  updateMenuItem(itemId: number, item: Partial<MenuItem>): Observable<MenuItem> {
    return this.http.put<MenuItem>(`${environment.apiUrl}/menu-items/${itemId}`, item);
  }

  deleteMenuItem(itemId: number): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/menu-items/${itemId}`);
  }

  readonly LOME_DISTRICTS = [
    { value: 'Adidogomé',   label: 'Adidogomé',   lat: 6.1372, lng: 1.1731 },
    { value: 'Agoè',        label: 'Agoè',         lat: 6.1890, lng: 1.2130 },
    { value: 'Bè',          label: 'Bè',           lat: 6.1163, lng: 1.2317 },
    { value: 'Tokoin',      label: 'Tokoin',       lat: 6.1415, lng: 1.2185 },
    { value: 'Hédzranawoé', label: 'Hédzranawoé',  lat: 6.1520, lng: 1.1960 },
    { value: 'Baguida',     label: 'Baguida',      lat: 6.0967, lng: 1.2800 },
    { value: 'Kodjoviakopé',label: 'Kodjoviakopé', lat: 6.1340, lng: 1.2060 },
    { value: 'Lomé Centre', label: 'Lomé Centre',  lat: 6.1375, lng: 1.2123 },
    { value: 'Nukafu',      label: 'Nukafu',       lat: 6.1700, lng: 1.1850 },
    { value: 'Djidjolé',    label: 'Djidjolé',     lat: 6.1600, lng: 1.1900 },
    { value: 'Légos Beach', label: 'Légos Beach',  lat: 6.1100, lng: 1.2400 },
    { value: 'Nyékonakpoè', label: 'Nyékonakpoè',  lat: 6.1440, lng: 1.2270 },
  ];

  getBusinessesNearby(lat: number, lng: number, radius = 10, type?: string): Observable<any> {
    let params = `lat=${lat}&lng=${lng}&radius=${radius}`;
    if (type) params += `&type=${type}`;
    return this.http.get<any>(`${environment.apiUrl}/businesses/nearby?${params}`);
  }

  getBusinessesByDistrict(district: string, type?: string): Observable<any> {
    let params = `district=${encodeURIComponent(district)}`;
    if (type) params += `&type=${type}`;
    return this.http.get<any>(`${environment.apiUrl}/businesses/by-district?${params}`);
  }
}