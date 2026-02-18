import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ChatWidgetComponent } from './shared/components/chat-widget/chat-widget.component';
import { ChatService } from './core/services/chat/chat.service';
import { AuthService } from './core/services/auth/auth.service';
import { NavbarComponent } from './shared/header/navbar/navbar.component';
import { FooterComponent } from './shared/footer/footer.component';
import { MaintenanceModalComponent } from './shared/modal/maintenance-modal/maintenance-modal.component';
import { ToastModalComponent } from './shared/modal/toast-modal/toast-modal.component';
import { ConfirmationModalComponent } from './shared/modal/confirmation-modal/confirmation-modal.component';  // ✅ AJOUTER

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    CommonModule,
    NavbarComponent,
    FooterComponent,
    ChatWidgetComponent,
    MaintenanceModalComponent,
    ToastModalComponent,
    ConfirmationModalComponent
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  title = 'app-resto-traiteur';

  constructor(
    private chatService: ChatService,
    private authService: AuthService
  ) {}

  ngOnInit() {
    this.authService.currentUser$.subscribe(user => {
      if (user) {
        const token = this.authService.getToken();
        if (token) {
          this.chatService.connectSocket(token);
          this.chatService.updateUnreadCount();
        }
      } else {
        this.chatService.disconnectSocket();
      }
    });
  }
}