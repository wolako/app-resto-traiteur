// src/app/core/services/contact/contact.service.ts

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface ContactPayload {
  name:    string;
  email:   string;
  phone:   string;
  subject: string;
  message: string;
}

export interface ContactResponse {
  success:  boolean;
  message:  string;
  data?:    { id: number; created_at: string };
}

@Injectable({ providedIn: 'root' })
export class ContactService {

  private readonly url = `${environment.apiUrl}/contact`;

  constructor(private http: HttpClient) {}

  /** Envoie le message du formulaire de contact public */
  sendMessage(payload: ContactPayload): Observable<ContactResponse> {
    return this.http.post<ContactResponse>(this.url, payload);
  }

  /** Admin : liste des messages */
  getMessages(params: { status?: string; page?: number; limit?: number } = {}): Observable<any> {
    return this.http.get<any>(this.url, { params: params as any });
  }

  /** Admin : détail + marque comme lu */
  getMessage(id: number): Observable<any> {
    return this.http.get<any>(`${this.url}/${id}`);
  }

  /** Admin : répondre */
  replyToMessage(id: number, reply: string): Observable<any> {
    return this.http.patch<any>(`${this.url}/${id}/reply`, { reply });
  }

  /** Admin : archiver */
  archiveMessage(id: number): Observable<any> {
    return this.http.patch<any>(`${this.url}/${id}/archive`, {});
  }
}