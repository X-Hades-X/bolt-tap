import {ComponentFixture, TestBed} from '@angular/core/testing';
import {WalletDetailsPage} from './wallet-details-page.component';
import {provideHttpClient} from '@angular/common/http';

describe('WalletDetailsPage', () => {
  let component: WalletDetailsPage;
  let fixture: ComponentFixture<WalletDetailsPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WalletDetailsPage],
      providers: [provideHttpClient()],
    }).compileComponents();

    fixture = TestBed.createComponent(WalletDetailsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
