// src/app/core/services/menu/menu.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Menu, MenuItem } from '../../models/menu.model';

@Injectable({
  providedIn: 'root'
})
export class MenuService {

  private api = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // ── Menus ────────────────────────────────────────────────────

  getMenuById(menuId: number): Observable<any> {
    return this.http.get(`${this.api}/menus/${menuId}`);
  }

  // ── Menu Items ───────────────────────────────────────────────

  /** Récupère tous les items d'un menu (route publique) */
  getMenuItems(menuId: number): Observable<any> {
    return this.http.get(`${this.api}/menus/${menuId}/items`);
  }

  /** Crée un nouvel item */
  createMenuItem(menuId: number, data: Partial<MenuItem>): Observable<any> {
    return this.http.post(`${this.api}/menus/${menuId}/items`, data);
  }

  /** Met à jour un item existant */
  updateMenuItem(itemId: number, data: Partial<MenuItem>): Observable<any> {
    return this.http.put(`${this.api}/menu-items/${itemId}`, data);
  }

  /** Supprime un item */
  deleteMenuItem(itemId: number): Observable<any> {
    return this.http.delete(`${this.api}/menu-items/${itemId}`);
  }

  uploadMenuItemImage(file: File): Observable<any> {
    const formData = new FormData();
    formData.append('image', file);
    return this.http.post(`${this.api}/menu-items/upload-image`, formData);
  }
  
}