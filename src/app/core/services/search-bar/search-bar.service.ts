// src/app/core/services/search-bar/search-bar.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface SearchBarState {
  visible: boolean;
  searchTerm: string;
  typeFilter: string;
  availabilityFilter: string;
}

@Injectable({ providedIn: 'root' })
export class SearchBarService {
  private state = new BehaviorSubject<SearchBarState>({
    visible: false,
    searchTerm: '',
    typeFilter: '',
    availabilityFilter: ''
  });

  state$ = this.state.asObservable();

  setVisible(visible: boolean): void {
    this.state.next({ ...this.state.value, visible });
  }

  updateFilters(filters: Partial<SearchBarState>): void {
    this.state.next({ ...this.state.value, ...filters });
  }

  getState(): SearchBarState {
    return this.state.value;
  }
}