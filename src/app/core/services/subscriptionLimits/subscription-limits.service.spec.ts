import { TestBed } from '@angular/core/testing';

import { SubscriptionLimitsService } from './subscription-limits.service';

describe('SubscriptionLimitsService', () => {
  let service: SubscriptionLimitsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SubscriptionLimitsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
