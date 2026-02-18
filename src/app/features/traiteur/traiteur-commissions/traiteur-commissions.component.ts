import { Component } from '@angular/core';
import { CommissionsViewComponent } from '../../../shared/commissions-view/commissions-view.component';

@Component({
  selector: 'app-traiteur-commissions',
  standalone: true,
  imports: [CommissionsViewComponent],
  templateUrl: './traiteur-commissions.component.html',
  styleUrl: './traiteur-commissions.component.scss'
})
export class TraiteurCommissionsComponent {

}
