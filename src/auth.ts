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

import type mxjssdk from 'matrix-js-sdk/lib';

const lib: typeof mxjssdk = require('matrix-js-sdk/lib/browser-index');

const createClientImpl: typeof mxjssdk.createClient = lib.createClient;

import { LocalStorageCryptoStore } from 'matrix-js-sdk/lib/crypto/store/localStorage-crypto-store';
import { WebStorageSessionStore } from 'matrix-js-sdk/lib/store/session/webstorage';
import { MatrixFiles } from 'matrix-files-sdk';

export async function getWellKnown(baseUrl: string): Promise<{ 'm.authentication'? :{ issuer?: string }, 'm.homeserver'?: { base_url?: string } }> {
    const url = new URL(baseUrl);
    url.search = '';
    url.pathname = '/.well-known/matrix/client';
    const response = await fetch(url.href);
    return response.json();
} 

export async function getLoginFlows(baseUrl: string) {
    const tempClient = createClientImpl({ baseUrl });

    return tempClient.loginFlows() as Promise<{
        flows: [
            { type: string }
        ],
    }>;
}

export async function loginWithPassword(
    localStorage: Storage,
    homeserver: string,
    username: string,
    password: string,
): Promise<MatrixFiles> {
    const tempClient = createClientImpl({
        baseUrl: homeserver,
    });

    const res = await tempClient.loginWithPassword(username, password);
    const {
        access_token: accessToken,
        user_id: userId,
        well_known: wellKnown,
        device_id: deviceId,
    } = res;
    const baseUrl = wellKnown?.['m.homeserver']?.['base_url'] ?? homeserver;

    return createClient(localStorage, { baseUrl, accessToken, userId, deviceId });
}

export async function createFromToken(
    localStorage: Storage,
    homeserver: string,
    accessToken: string,
    userId: string,
    deviceId: string,
): Promise<MatrixFiles> {
    const files = await createClient(localStorage, { baseUrl: homeserver, accessToken, userId, deviceId });
    // used as a "ping" to spot connection errors
    await files.client.waitForClientWellKnown();
    return files;
}

export async function registerWithPassword(
    localStorage: Storage,
    homeserver: string,
    username: string,
    password: string,
): Promise<MatrixFiles> {
    const tempClient = createClientImpl({
        baseUrl: homeserver,
    });

    const res = await tempClient.register(username, password, null, { type: 'm.login.dummy' });
    const {
        access_token: accessToken,
        user_id: userId,
        well_known: wellKnown,
        device_id: deviceId,
    } = res;
    const baseUrl = wellKnown?.['m.homeserver']?.['base_url'] ?? homeserver;

    return createFromToken(localStorage, baseUrl, accessToken, userId, deviceId);
}

export async function createClient(
    localStorage: Storage,
    options: mxjssdk.ICreateClientOpts,
): Promise<MatrixFiles> {
    const sessionStore = new WebStorageSessionStore(localStorage);
    const cryptoStore = new LocalStorageCryptoStore(localStorage);

    await cryptoStore.startup();
    const client = createClientImpl({
        ...options,
        sessionStore,
        cryptoStore,
        useAuthorizationHeader: true, // presumably this is good practice
        // these are copied from files-sdk:
        cryptoCallbacks: {},
        timelineSupport: true, // for file management
        unstableClientRelationAggregation: true, // for edits
    });

    return new MatrixFiles(client);
}
