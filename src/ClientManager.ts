/*
Copyright 2021-2022 New Vector Ltd.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import type { MatrixFiles } from "matrix-files-sdk";
import { loginWithPassword, createFromToken, registerWithPassword } from "./auth";
import { readValue, storeValue } from "./storage";
import { MatrixCrypto } from "./MatrixCrypto";
import { SimpleObservable } from "./external/SimpleObservable";
import { MatrixError } from "matrix-js-sdk";
import { toasts } from "svelte-toasts";
import router from 'page';
import { getLogger } from "log4js";
import {
    UserManager, MetadataService, OidcClientSettingsStore, type DeviceAuthorizationResponse, type OidcMetadata,
} from 'oidc-client-ts';
import { v4 } from 'uuid';

const log = getLogger('ClientManager');

const defaultHomeserver = process.env.DEFAULT_HOMESERVER!;

type IssuerUri = string;
interface ClientConfig {
    client_id: string;
    client_secret?: string;
}

// These are statically configured OIDC client IDs for particular issuers:
const clientIds: Record<IssuerUri, ClientConfig> = {
    "https://dev-6525741.okta.com/": {
        client_id: "0oa5qpnjvfLILbe3W5d7",
    },
    "http://localhost:8091/realms/master/": {
        client_id: "file-sdk-demo"
    },
    "https://keycloak-oidc.lab.element.dev/realms/master/": {
        client_id: "file-sdk-demo"
    },
};

export class ClientManager {
    private _files: MatrixFiles | undefined;
    private _crypto: MatrixCrypto | undefined;
    private oidcIssuerMetadata?: Partial<OidcMetadata>;
    private deviceFlow?: DeviceAuthorizationResponse;

    public readonly authedState = new SimpleObservable<boolean>(false);

    public get homeserverUrl(): string {
        return readValue("homeserverUrl", defaultHomeserver);
    }

    public set homeserverUrl(val) {
        storeValue("homeserverUrl", val);
    }

    public get oidcIssuer(): string {
        return readValue("oidcIssuer", '');
    }

    public set oidcIssuer(val) {
        storeValue("oidcIssuer", val);
    }

    public get oidcClientIssuer(): string {
        return readValue("oidcClientIssuer", '');
    }

    public set oidcClientIssuer(val) {
        storeValue("oidcClientIssuer", val);
    }

    public get oidcClientId(): string {
        return readValue("oidcClientId", '');
    }

    public set oidcClientId(val) {
        storeValue("oidcClientId", val);
    }

    public get oidcClientSecret(): string | undefined {
        return readValue("oidcClientSecret", undefined);
    }

    public set oidcClientSecret(val) {
        storeValue("oidcClientSecret", val);
    }

    public get accessToken(): string {
        return readValue("accessToken", '');
    }

    public set accessToken(val) {
        storeValue("accessToken", val);
    }

    public get deviceId(): string {
        return readValue("deviceId", '');
    }

    public set deviceId(val) {
        storeValue("deviceId", val);
    }

    public get userId(): string {
        return readValue("userId", '');
    }

    public set userId(val) {
        storeValue("userId", val);
    }

    public password: string = '';
    public keyBackupPassphrase: string = '';

    public nextRoute: string | undefined;

    public get files(): MatrixFiles {
        if (!this._files) {
            throw new Error('No MatrixFiles connected');
        }
        return this._files;
    }

    public get client() {
        if (!this._files) {
            throw new Error('No MatrixFiles connected');
        }
        return this._files.getClient();
    }

    public get crypto() {
        if (!this._crypto) {
            throw new Error('No MatrixFiles connected');
        }
        return this._crypto;
    }

    private userManager: UserManager | undefined;

    private grant_types_supported: string[] = [];

    private async getIssuerMetadata() {
        if (!this.oidcIssuerMetadata || this.oidcIssuer !== this.oidcIssuerMetadata.issuer) {
            this.oidcIssuerMetadata = await (new MetadataService(new OidcClientSettingsStore({
            authority: this.oidcIssuer,
            redirect_uri: 'notused',
            client_id: 'notused',
            }))).getMetadata();
            const {
                grant_types_supported, device_authorization_endpoint, authorization_endpoint,
            } = this.oidcIssuerMetadata;
            if (grant_types_supported) {
                this.grant_types_supported = grant_types_supported;
            } else {
                this.grant_types_supported = [];
                if (authorization_endpoint) {
                    this.grant_types_supported.push("authorization_code");
                    this.grant_types_supported.push("refresh_token");
                }
                if (device_authorization_endpoint) {
                    this.grant_types_supported.push("urn:ietf:params:oauth:grant-type:device_code");
                }
            }
        }
        return this.oidcIssuerMetadata;
    }

    public async assertOidcClientId() {
        const authority = this.authority;

        // use cached or pre-configured if available
        if (clientIds[authority]) {
            this.oidcClientId = clientIds[authority].client_id;
            this.oidcClientSecret = clientIds[authority].client_secret;
            this.oidcClientIssuer = authority;
            log.info(`Using existing OIDC client_id ${this.oidcClientId} with issuer ${authority}`);
        } else if (!this.oidcClientId || this.oidcClientIssuer !== authority) {
            const { registration_endpoint } = await this.getIssuerMetadata();

            if (!registration_endpoint) {
                throw new Error('Unable to register with issuer');
            }

            // only ask for grants that are supported by the client and server
            const grant_types = ["authorization_code", "refresh_token", "urn:ietf:params:oauth:grant-type:device_code"].filter(x => this.grant_types_supported.includes(x));

            if (grant_types.length === 0 || (grant_types.length === 1 && grant_types.includes("refresh_token"))) {
                throw new Error('No supported authentication flow available');
            }

            log.info(`Attempting registration with OIDC issuer at ${registration_endpoint}`);

            const clientMetadata = {
                client_name: "Files SDK Demo",
                logo_uri: new URL("logo.svg", this.client_uri).href,
                client_uri: this.client_uri,
                tos_uri: "https://element.io/terms-of-service",
                policy_uri: "https://element.io/privacy",
                response_types: ["code"],
                grant_types,
                redirect_uris: [this.redirect_uri],
                id_token_signed_response_alg: "RS256",
                token_endpoint_auth_method: "none",
            };

            try {
                const res = await fetch(registration_endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    credentials: "omit",
                    cache: 'no-cache',
                    body: JSON.stringify(clientMetadata),
                });

                const json = await res.json();

                // Cache the client details for subsequent use
                clientIds[authority] = {
                    client_id: json.client_id,
                    client_secret: json.client_secret,
                };

                log.info(`Registered with OIDC issuer as ${json.client_id}`);

                // handle case of authority changing since we started registration:
                if (authority === this.authority) {
                    this.oidcClientId = json.client_id;
                    this.oidcClientSecret = json.client_secret;
                    this.oidcClientIssuer = authority;
                }
            } catch (e: any) {
                log.error(e);
                throw new Error(`Unable to register with OIDC Provider (${authority}) - ${e?.message}`);
            }
        }

        if (!await this.hasUsableGrant()) {
            throw new Error('No supported authentication flow available');
        }
    }

    private static supportedGrants = ['authorization_code', 'urn:ietf:params:oauth:grant-type:device_code'];

    public async hasUsableGrant(): Promise<boolean> {
        await this.getIssuerMetadata();
        return !!this.grant_types_supported.some(x => ClientManager.supportedGrants.includes(x));
    }

    public async supportsDeviceCode(): Promise<boolean> {
        const { device_authorization_endpoint } = await this.getIssuerMetadata();
        return !!(this.grant_types_supported.includes('urn:ietf:params:oauth:grant-type:device_code') && device_authorization_endpoint);
    }

    private get authority(): string {
        return `${this.oidcIssuer}${this.oidcIssuer.endsWith('/') ? '' : '/'}`;
    }

    private get client_uri(): string {
        return document.location.origin + document.location.pathname;
    }

    private get redirect_uri(): string {
        return this.client_uri;
    }

    private async getOidcUserManager() {
        if (this.userManager && this.userManager.settings.authority !== this.oidcIssuer) {
            log.info('Recreating OIDC UserManager as issuer changed');
            this.userManager.stopSilentRenew();
            this.userManager = undefined;
        }

        if (!this.userManager) {
            await this.assertOidcClientId();

            if (!this.deviceId) {
                this.deviceId = v4();
            }

            this.userManager = new UserManager({
                authority: this.authority,
                client_id: this.oidcClientId,
                client_secret: this.oidcClientSecret,
                redirect_uri: this.redirect_uri,
                accessTokenExpiringNotificationTimeInSeconds: 30,
                scope: `openid profile offline_access urn:matrix:api:* urn:matrix:device:${this.deviceId}`,
            });
            this.userManager.events.addUserLoaded(({ access_token, expires_in }) => {
                log.debug(`Access token renewed with new expiry in ${expires_in}s`);
                this.accessToken = access_token;
                if (this._files) {
                    this._files.client.http.opts.accessToken = access_token;
                }
            });
        }

        return this.userManager;
    }

    public get hasAuthData(): boolean {
        log.debug(`hasAuthData() homeserverUrl=${!!this.homeserverUrl} accessToken=${!!this.accessToken} deviceId=${!!this.deviceId} userId=${!!this.userId}`);
        return !!this.homeserverUrl && !!this.accessToken && !!this.deviceId && !!this.userId;
    }

    private async wrapForbidden(f: () => Promise<any>) {
        try {
            await f();
        } catch (e: any) {
            log.error(e);
            if (e instanceof MatrixError && e.errcode === 'M_FORBIDDEN') {
                toasts.warning('You have been signed out', { duration: 5000 });
                await this._logout(this.homeserverUrl);
                router.redirect('/signin');
            } else {
                throw e;
            }
        }

    }

    public async rehydrate() {
        if (this.oidcIssuer) {
            // initialise UserManager for refreshing tokens
            this.getOidcUserManager();
        }
        await this.wrapForbidden(async () => {
            this._files = await createFromToken(localStorage, this.homeserverUrl, this.accessToken, this.userId, this.deviceId);
            await this.bootstrap();
        });
    }

    public async loginWithOidcNormalFlow() {
        log.info('loginWithOidcNormalFlow()');
        const userManager = await this.getOidcUserManager();
        await userManager.signinRedirect({ prompt: 'login' });
    }

    public async startLoginWithOidcDeviceFlow(): Promise<DeviceAuthorizationResponse> {
        log.info('startLoginWithOidcDeviceFlow()');
        const userManager = await this.getOidcUserManager();
        this.deviceFlow = await userManager.startDeviceAuthorization();
        return this.deviceFlow;
    }

    public async waitForLoginWithOidcDeviceFlow() {
        log.info('waitForLoginWithOidcDeviceFlow()');
        if (!this.deviceFlow) {
            throw new Error('Device flow not started');
        }
        const userManager = await this.getOidcUserManager();
        const res = await userManager.waitForDeviceAuthorization(this.deviceFlow);
        this.deviceFlow = undefined;
        const { access_token } = res;
        if (access_token) {
            await this.whoami(access_token as string);
            await this.rehydrate();
        }
        router.redirect('/');
        return res;
    }

    public async registerWithOidc() {
        log.info('registerWithOidc()');
        await (await this.getOidcUserManager()).signinRedirect({ prompt: 'create' });
    }

    private async whoami(access_token: string) {
        const url = new URL(this.homeserverUrl);
        url.search = '';
        url.pathname = '/_matrix/client/v3/account/whoami';

        const response = await fetch(url.href, { headers: { Authorization: `Bearer ${access_token}` } });

        const { device_id, user_id } = await response.json();

        log.info(`whoami() => device_id=${device_id} user_id=${user_id}`);
        this.accessToken = access_token;
        this.deviceId = device_id;
        this.userId = user_id;
        this.password = '';
    }

    public async completeOidcLogin() {
        log.info('completeOidcLogin()');

        const authority = this.oidcIssuer;
        if (!authority) {
            log.warn('Received OIDC code but no issuer available');
        } else {
            const signinResponse = await (await this.getOidcUserManager()).signinCallback();
            if (signinResponse) {
                const { access_token } = signinResponse;
                
                await this.whoami(access_token);

                // remove query params from current URL:
                window.history.pushState('object', document.title, location.href.split("?")[0]);

                await this.rehydrate();

                router.replace('/');
            }
        }
    }

    public async loginWithPassword() {
        log.info('loginWithPassword()');
        this._files = await loginWithPassword(localStorage, this.homeserverUrl, this.userId, this.password);

        this.homeserverUrl = this.client.getHomeserverUrl();
        this.accessToken = this.client.getAccessToken();
        this.deviceId = this.client.deviceId ?? '';
        this.userId = this.client.getUserId();

        await this.wrapForbidden(this.bootstrap);
    }

    public async register() {
        log.info('register()');
        this._files = await registerWithPassword(localStorage, this.homeserverUrl, this.userId, this.password);

        this.homeserverUrl = this.client.getHomeserverUrl();
        this.accessToken = this.client.getAccessToken();
        this.deviceId = this.client.deviceId ?? '';
        this.userId = this.client.getUserId();

        await this.wrapForbidden(this.bootstrap);
    }

    private async bootstrap() {
        if (!this._files) {
            throw new Error('Not logged in');
        }
        this.client.on("Session.logged_out", () => {
            console.log("Session.logged_out");
            this._logout(this.homeserverUrl);
        });
        // ping to check that session is valid
        await this.client.whoami();
        this._crypto = new MatrixCrypto(this._files.client);
        await this._crypto.init();
        await this._files.sync();
        toasts.info(`${this.userId} logged in`, { duration: 5000 });
        this.authedState.update(true);
    }

    private async _logout(homeserver?: string) {
        // try {
        //     await logoutOidc();
        // } catch (e) {
        //     // it might be that it isn't intialised
        // }
        this.homeserverUrl = homeserver ?? defaultHomeserver;
        this.userId = '';
        this.keyBackupPassphrase = '';
        this.password = '';
        this.deviceId = '';
        this.accessToken = '';
        this.authedState.update(false);
    }

    public async logout() {
        log.info('logout()');
        if (this._files) {
            try {
                await this._files.logout();
            } catch (e) {
                log.warn(e);
            }
            this._files = undefined;
            this._crypto = undefined;
        }
        localStorage.clear();
        sessionStorage.clear();
        await this._logout();
    }

    on(event: string, handler: (...args: any[]) => void) {
        if (this._files) {
            this._files.on(event, handler);
        }        
    }

    off(event: string, handler: (...args: any[]) => void) {
        if (this._files) {
            this._files.off(event, handler);
        }        
    }
}
