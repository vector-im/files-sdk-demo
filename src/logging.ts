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

import { configure, getLogger } from 'log4js';
import { Log } from 'oidc-client-ts';

configure({
    appenders: {
        console: {
            type: 'console',
            layout: { type: 'coloured' },
        },
    },
    categories: {
        default: {
            appenders: ['console'],
            level: 'debug',
        },
        OIDC: {
            appenders: ['console'],
            level: 'info',
        },
        Storage: {
            appenders: ['console'],
            level: 'info',
        },
        MatrixFilesSDK: {
            appenders: ['console'],
            level: 'trace',
        },
    },
});

getLogger('logging').info('log4js configured');

Log.setLogger(getLogger('OIDC'));
Log.setLevel(Log.DEBUG);
