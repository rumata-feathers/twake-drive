import Oidc from 'oidc-client';

import environment from '../../../../environment/environment';
import { ConsoleConfiguration } from '../../../global/services/init-service';
import Observable from '../../../../deprecated/Observable/Observable';
import Logger from '@features/global/framework/logger-service';
import { getAsFrontUrl } from '@features/global/utils/URLUtils';
import { TdriveService } from '../../../global/framework/registry-decorator-service';
import EnvironmentService from '../../../global/framework/environment-service';
import { AuthProvider, InitParameters } from '../auth-provider';
import LocalStorage from '@features/global/framework/local-storage-service';

const OIDC_CALLBACK_URL = '/oidccallback';
const OIDC_SIGNOUT_URL = '/signout';
const OIDC_SILENT_URL = '/oidcsilent';

@TdriveService('OIDCAuthProvider')
export default class OIDCAuthProviderService
  extends Observable
  implements AuthProvider<unknown, unknown, unknown>
{
  private logger: Logger.Logger;
  private userManager: Oidc.UserManager | null = null;
  private initialized = false;
  private user!: Oidc.User;
  private params?: InitParameters;

  constructor(private configuration?: ConsoleConfiguration) {
    super();
    this.logger = Logger.getLogger('OIDCLoginProvider');
    this.logger.debug('OIDC configuration', configuration);
  }

  init(params: InitParameters): this {
    this.params = params;

    if (this.initialized) {
      this.logger.warn('Already initialized');
      return this;
    }

    if (!this.userManager) {
      Oidc.Log.logger = Logger.getLogger('OIDCClient');
      Oidc.Log.level = EnvironmentService.isProduction() ? Oidc.Log.WARN : Oidc.Log.DEBUG;

      this.userManager = new Oidc.UserManager({
        userStore: new Oidc.WebStorageStateStore({ store: window.localStorage }),
        authority: this.configuration?.authority || environment.api_root_url,
        client_id: this.configuration?.client_id,
        redirect_uri: getAsFrontUrl(OIDC_CALLBACK_URL),
        response_type: 'code',
        response_mode: 'query',
        scope: 'openid profile email address phone offline_access',
        post_logout_redirect_uri: getAsFrontUrl(OIDC_SIGNOUT_URL),
        silent_redirect_uri: getAsFrontUrl(OIDC_SILENT_URL),
        automaticSilentRenew: false,
        loadUserInfo: true,
        accessTokenExpiringNotificationTime: 10,
        filterProtocolClaims: true,
        monitorSession: true,
      });

      // For logout if signout or logout endpoint called
      // FIXME: This is not called, we must create the routes for it
      if ([OIDC_SIGNOUT_URL, '/logout'].includes(document.location.pathname)) {
        this.logger.debug('Redirect signout');
        this.signOut();
      }

      this.userManager.events.addUserSignedIn(() => {
        this.logger.debug('User Signed In：');
      });

      this.userManager.events.addUserSignedOut(() => {
        this.logger.debug('User Signed Out：');
      });

      this.userManager.events.addUserLoaded((user: any, ...args) => {
        this.logger.debug('New User Loaded：', user, args);
        this.logger.debug('Acess_token: ', user.access_token);
      });

      this.userManager.events.addAccessTokenExpiring((...args) => {
        this.logger.debug('AccessToken Expiring：', args);
      });

      this.userManager.events.addAccessTokenExpired((...args) => {
        this.logger.debug('AccessToken Expired：', args);
      });

      this.userManager.events.addSilentRenewError((...args) => {
        console.error('Silent Renew Error：', args);
      });
    }

    return this;
  }

  async signIn(): Promise<void> {
    this.logger.info('Signin');

    try {
      await this.userManager?.signinRedirectCallback();
    } catch (e) {
      console.log('Not connected, connect through SSO');
    }

    const user = await this.userManager?.getUser();

    if (user) {
        if (!this.initialized) {
          this.onInitialized();
          this.initialized = true;
        }
    } else {
      this.userManager?.signinRedirect();
    }
  }

  async signUp(): Promise<void> {
    console.error("This doesn't exists for console provider.");
  }

  async signOut(): Promise<void> {
    this.logger.info('Signout');

    if (!this.userManager) {
      return;
    }

    try {
      // in some cases/providers we have to call remove to be sure to logout
      await this.userManager.removeUser();
    } catch (err) {
      this.logger.error('Can not delete user in signout', err);
    }

    try {
      await this.userManager.signoutRedirect({ id_token_hint: this.user?.id_token });
    } catch (err) {
      this.logger.error('Signout redirect error', err);
    }
  }

  onInitialized() {
    //If user requested an url in the last 10 minutes, we open it
    const ref = LocalStorage.getItem('requested_url') as { url: string; time: number };
    if (ref && new Date().getTime() - ref.time < 1000 * 60 * 10) {
      LocalStorage.setItem('requested_url', null);
      document.location.replace(ref.url);
    }
    //End of post-login redirection

    this.params?.onInitialized();
  }
}
