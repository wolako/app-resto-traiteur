import { Component } from '@angular/core';
import { CommissionsViewComponent } from '../../../shared/commissions-view/commissions-view.component';

@Component({
  selector: 'app-restaurant-commissions',
  standalone: true,
  imports: [CommissionsViewComponent],
  templateUrl: './restaurant-commissions.component.html',
  styleUrl: './restaurant-commissions.component.scss'
})
export class RestaurantCommissionsComponent {

}
