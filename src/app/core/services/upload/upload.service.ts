// core/services/upload/upload.service.ts
//
// Ce service gère les uploads de fichiers via HttpClient Angular
// en s'assurant que Content-Type n'est JAMAIS défini manuellement
// pour les requêtes FormData (le browser doit le faire avec le bon boundary).
//
// Il lit le token depuis le storage de la même façon que l'intercepteur
// pour éviter de le faire via XHR.

import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class UploadService {

  constructor(private http: HttpClient) {}

  /**
   * Upload un fichier via POST multipart/form-data.
   *
   * ✅ IMPORTANT : on crée un HttpHeaders VIDE ou sans Content-Type.
   * Si un intercepteur Angular ajoute Content-Type: application/json,
   * il faut qu'il détecte FormData et ne le fasse pas.
   * Cette méthode passe un header 'X-Skip-Content-Type': 'true'
   * que l'intercepteur peut utiliser pour détecter ce cas.
   *
   * Si ton intercepteur ne gère pas ce cas, utilise uploadViaFetch()
   * qui bypasse complètement Angular.
   */
  uploadFile(url: string, formData: FormData): Observable<any> {
    // ✅ Ne PAS définir Content-Type — laisser le browser avec FormData
    // Certains intercepteurs lisent les headers et sautent Content-Type si absent
    const headers = new HttpHeaders({
      'ngrok-skip-browser-warning': 'true',
      'X-Skip-Content-Type': 'true',   // signal pour l'intercepteur
    });

    return this.http.post(url, formData, { headers });
  }

  /**
   * Upload via fetch() natif — bypasse TOTALEMENT Angular HttpClient
   * et tous ses intercepteurs.
   * À utiliser si uploadFile() ne fonctionne pas à cause d'un intercepteur.
   */
  uploadViaFetch(url: string, formData: FormData, token: string): Promise<any> {
    return fetch(url, {
      method:  'POST',
      headers: {
        // ✅ JAMAIS de Content-Type avec FormData en fetch non plus
        'Authorization':              `Bearer ${token}`,
        'ngrok-skip-browser-warning': 'true',
      },
      body: formData,
    }).then(res => {
      if (!res.ok) return res.json().then(e => Promise.reject(e));
      return res.json();
    });
  }
}